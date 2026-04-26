package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Types ──────────────────────────────────────────────────────────────────────

type ScaffoldRequest struct {
	InstanceID      string `json:"instance_id"`
	Name            string `json:"name"`
	IFlowID         string `json:"iflow_id"`
	PackageName     string `json:"package_name"`
	PackageID       string `json:"package_id"`
	Description     string `json:"description"`
	SenderAdapter   string `json:"sender_adapter"`   // HTTPS | SFTP
	ReceiverAdapter string `json:"receiver_adapter"` // HTTP | SFTP
	IncludeGroovy   bool   `json:"include_groovy"`
	GroovyName      string `json:"groovy_name"`
	IncludeXSLT     bool   `json:"include_xslt"`
	XSLTName        string `json:"xslt_name"`
}

var scaffoldAllowedTypes = map[string]bool{"TRL": true, "SBX": true, "DEV": true}

// ── Handler ────────────────────────────────────────────────────────────────────

func makeScaffoldHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ScaffoldRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		if req.Name == "" || req.IFlowID == "" {
			jsonError(w, "name and iflow_id are required", http.StatusBadRequest)
			return
		}
		if !isValidCPIName(req.IFlowID) {
			jsonError(w, "iflow_id must start with a letter or underscore and contain only letters, digits, spaces, periods, or hyphens — and must not end with a period", http.StatusBadRequest)
			return
		}

		var systemType string
		if err := pool.QueryRow(r.Context(),
			`SELECT system_type FROM w_cpi_instances WHERE id = $1`, req.InstanceID,
		).Scan(&systemType); err != nil {
			jsonError(w, "instance not found", http.StatusNotFound)
			return
		}
		if !scaffoldAllowedTypes[systemType] {
			jsonError(w, fmt.Sprintf("iFlow Scaffold is not permitted for %s environments — restricted to TRL, SBX, DEV only", systemType), http.StatusForbidden)
			return
		}

		tmplMap := loadAllScaffoldTemplates(r.Context(), pool)
		zipBytes, err := generateScaffoldZIP(req, tmplMap)
		if err != nil {
			jsonError(w, "generation failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		filename := req.IFlowID + ".zip"
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(zipBytes)))
		w.WriteHeader(http.StatusOK)
		w.Write(zipBytes) //nolint:errcheck
	}
}

// ── ZIP builder ────────────────────────────────────────────────────────────────

func generateScaffoldZIP(req ScaffoldRequest, tmplMap map[string]string) ([]byte, error) {
	groovyName := req.GroovyName
	if groovyName == "" {
		groovyName = "script"
	}
	xsltName := req.XSLTName
	if xsltName == "" {
		xsltName = "mapping"
	}
	safeIFlowName := sanitizeFilename(req.Name)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	files := map[string]string{
		"META-INF/MANIFEST.MF": fmt.Sprintf(
			"Manifest-Version: 1.0\nBundle-ManifestVersion: 2\nBundle-Name: %s\nBundle-SymbolicName: %s;singleton:=true\nOrigin-Bundle-SymbolicName: %s\nBundle-Version: 1.0.0\nOrigin-Bundle-Version: 1.0.0\nOrigin-Bundle-Name: %s\nSAP-BundleType: IntegrationFlow\nSAP-NodeType: IFLMAP\nSAP-RuntimeProfile: iflmap\nSAP_MANIFEST_NAME: %s\n\n",
			req.Name, req.IFlowID, req.IFlowID, req.Name, req.Name,
		),
		"metainfo.prop": fmt.Sprintf(
			"#Store metainfo properties\n#%s\ndescription=%s\n",
			time.Now().UTC().Format("Mon Jan 02 15:04:05 UTC 2006"), req.Description,
		),
	}

	if req.IncludeGroovy {
		files["src/main/resources/script/"+groovyName+".groovy"] = groovyStub(groovyName)
	}
	if req.IncludeXSLT {
		files["src/main/resources/mapping/"+xsltName+".xsl"] = xsltStub()
	}

	files["src/main/resources/scenarioflows/integrationflow/"+safeIFlowName+".iflw"] = generateIFlowXML(req, groovyName, xsltName, tmplMap)

	for path, content := range files {
		f, err := zw.Create(path)
		if err != nil {
			return nil, err
		}
		if _, err := f.Write([]byte(content)); err != nil {
			return nil, err
		}
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ── iFlow XML ──────────────────────────────────────────────────────────────────

type flowStep struct {
	ID, Name string
	X, Y     float64
}

func generateIFlowXML(req ScaffoldRequest, groovyName, xsltName string, tmplMap map[string]string) string {
	var steps []flowStep
	steps = append(steps, flowStep{"CallActivity_SetHeaders", "Set Standard Headers", 400, 180})
	if req.IncludeGroovy {
		steps = append(steps, flowStep{"CallActivity_Groovy", groovyName, 560, 180})
	}
	if req.IncludeXSLT {
		x := 560.0
		if req.IncludeGroovy {
			x = 720.0
		}
		steps = append(steps, flowStep{"CallActivity_XSLT", xsltName, x, 180})
	}

	lastX := 400.0 + 100
	if len(steps) > 1 {
		last := steps[len(steps)-1]
		lastX = last.X + 100
	}
	endEventX := lastX + 70
	receiverParticipantX := endEventX + 130

	poolWidth := receiverParticipantX - 220 + 60
	if poolWidth < 700 {
		poolWidth = 700
	}

	allIDs := []string{"StartEvent_1"}
	for _, s := range steps {
		allIDs = append(allIDs, s.ID)
	}
	allIDs = append(allIDs, "EndEvent_1")

	type sf struct{ id, from, to string }
	var seqFlows []sf
	for i := 1; i < len(allIDs); i++ {
		seqFlows = append(seqFlows, sf{
			id:   fmt.Sprintf("SequenceFlow_%d", i),
			from: allIDs[i-1],
			to:   allIDs[i],
		})
	}
	lastSF := seqFlows[len(seqFlows)-1].id

	allowedHeaders := ""
	if req.SenderAdapter == "SFTP" || req.ReceiverAdapter == "SFTP" {
		allowedHeaders = "CamelFileName"
	}

	var b strings.Builder

	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions
    xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    xmlns:ifl="http:///com.sap.ifl.model/Ifl.xsd"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    id="Definitions_1">
`)

	// ── Collaboration
	b.WriteString("\n    <bpmn2:collaboration id=\"Collaboration_1\" name=\"Default Collaboration\">\n")
	b.WriteString(renderScaffoldFragment(tmplMap, "collaboration_ext", scaffoldTmplData{AllowedHeaders: allowedHeaders}))
	b.WriteString("\n")
	b.WriteString(renderScaffoldFragment(tmplMap, "sender_participant", scaffoldTmplData{}))
	b.WriteString(`
        <bpmn2:participant id="Participant_Process_1" ifl:type="IntegrationProcess"
            name="Integration Process" processRef="Process_1">
            <bpmn2:extensionElements/>
        </bpmn2:participant>
`)
	b.WriteString(renderScaffoldFragment(tmplMap, "receiver_participant_"+req.ReceiverAdapter, scaffoldTmplData{}))
	b.WriteString(renderScaffoldFragment(tmplMap, "sender_messageflow_"+req.SenderAdapter, scaffoldTmplData{}))
	b.WriteString(renderScaffoldFragment(tmplMap, "receiver_messageflow_"+req.ReceiverAdapter, scaffoldTmplData{SourceRef: "EndEvent_1"}))
	b.WriteString("\n    </bpmn2:collaboration>\n")

	// ── Main process
	b.WriteString(`
    <bpmn2:process id="Process_1" name="Integration Process">
        <bpmn2:extensionElements>
            <ifl:property><key>transactionTimeout</key><value>30</value></ifl:property>
            <ifl:property><key>componentVersion</key><value>1.2</value></ifl:property>
            <ifl:property><key>cmdVariantUri</key><value>ctype::FlowElementVariant/cname::IntegrationProcess/version::1.2.1</value></ifl:property>
            <ifl:property><key>transactionalHandling</key><value>Not Required</value></ifl:property>
        </bpmn2:extensionElements>

        <bpmn2:startEvent id="StartEvent_1" name="Start">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.0</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageStartEvent/version::1.0</value></ifl:property>
                <ifl:property><key>activityType</key><value>StartEvent</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:outgoing>SequenceFlow_1</bpmn2:outgoing>
            <bpmn2:messageEventDefinition/>
        </bpmn2:startEvent>
`)

	// Content modifier (always first step)
	cmIdx := indexOf(allIDs, "CallActivity_SetHeaders")
	b.WriteString(renderScaffoldFragment(tmplMap, "step_content_modifier", scaffoldTmplData{
		SFIn:  seqFlows[cmIdx-1].id,
		SFOut: seqFlows[cmIdx].id,
	}))

	// Groovy
	if req.IncludeGroovy {
		idx := indexOf(allIDs, "CallActivity_Groovy")
		b.WriteString(renderScaffoldFragment(tmplMap, "step_groovy", scaffoldTmplData{
			GroovyName: groovyName,
			SFIn:       seqFlows[idx-1].id,
			SFOut:      seqFlows[idx].id,
		}))
	}

	// XSLT
	if req.IncludeXSLT {
		idx := indexOf(allIDs, "CallActivity_XSLT")
		b.WriteString(renderScaffoldFragment(tmplMap, "step_xslt", scaffoldTmplData{
			XSLTName: xsltName,
			SFIn:     seqFlows[idx-1].id,
			SFOut:    seqFlows[idx].id,
		}))
	}

	// End event
	fmt.Fprintf(&b, `
        <bpmn2:endEvent id="EndEvent_1" name="End">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageEndEvent/version::1.1.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>%s</bpmn2:incoming>
            <bpmn2:messageEventDefinition/>
        </bpmn2:endEvent>
`, lastSF)

	// Exception subprocess
	b.WriteString(renderScaffoldFragment(tmplMap, "step_exception_subprocess", scaffoldTmplData{}))

	// Sequence flows
	for _, sf := range seqFlows {
		fmt.Fprintf(&b, "        <bpmn2:sequenceFlow id=%q sourceRef=%q targetRef=%q/>\n", sf.id, sf.from, sf.to)
	}

	b.WriteString("    </bpmn2:process>\n")

	// ── BPMNDiagram
	fmt.Fprintf(&b, `
    <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Default Collaboration Diagram">
        <bpmndi:BPMNPlane bpmnElement="Collaboration_1" id="BPMNPlane_1">

            <bpmndi:BPMNShape bpmnElement="Participant_Sender" id="BPMNShape_Participant_Sender">
                <dc:Bounds height="100.0" width="100.0" x="60.0" y="160.0"/>
            </bpmndi:BPMNShape>

            <bpmndi:BPMNShape bpmnElement="Participant_Process_1" id="BPMNShape_Participant_Process_1">
                <dc:Bounds height="312.0" width="%.1f" x="220.0" y="110.0"/>
            </bpmndi:BPMNShape>

            <bpmndi:BPMNShape bpmnElement="Participant_Receiver" id="BPMNShape_Participant_Receiver">
                <dc:Bounds height="100.0" width="100.0" x="%.1f" y="160.0"/>
            </bpmndi:BPMNShape>

            <bpmndi:BPMNShape bpmnElement="StartEvent_1" id="BPMNShape_StartEvent_1">
                <dc:Bounds height="32.0" width="32.0" x="300.0" y="194.0"/>
            </bpmndi:BPMNShape>
`, poolWidth, receiverParticipantX)

	for _, s := range steps {
		fmt.Fprintf(&b,
			"            <bpmndi:BPMNShape bpmnElement=%q id=%q>\n                <dc:Bounds height=\"60.0\" width=\"100.0\" x=\"%.1f\" y=\"%.1f\"/>\n            </bpmndi:BPMNShape>\n",
			s.ID, "BPMNShape_"+s.ID, s.X, s.Y)
	}

	fmt.Fprintf(&b,
		"            <bpmndi:BPMNShape bpmnElement=\"EndEvent_1\" id=\"BPMNShape_EndEvent_1\">\n                <dc:Bounds height=\"32.0\" width=\"32.0\" x=\"%.1f\" y=\"194.0\"/>\n            </bpmndi:BPMNShape>\n",
		endEventX)

	ehX := 400.0
	ehWidth := 350.0
	fmt.Fprintf(&b, `
            <bpmndi:BPMNShape bpmnElement="SubProcess_EH" id="BPMNShape_SubProcess_EH">
                <dc:Bounds height="120.0" width="%.1f" x="%.1f" y="270.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="ErrorStartEvent_1" id="BPMNShape_ErrorStartEvent_1">
                <dc:Bounds height="32.0" width="32.0" x="%.1f" y="304.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="CallActivity_EH" id="BPMNShape_CallActivity_EH">
                <dc:Bounds height="60.0" width="100.0" x="%.1f" y="290.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="EndEvent_EH" id="BPMNShape_EndEvent_EH">
                <dc:Bounds height="32.0" width="32.0" x="%.1f" y="304.0"/>
            </bpmndi:BPMNShape>
`, ehWidth, ehX, ehX+20, ehX+100, ehX+260)

	stepCentersX := map[string]float64{"StartEvent_1": 316}
	for _, s := range steps {
		stepCentersX[s.ID] = s.X + 50
	}
	stepCentersX["EndEvent_1"] = endEventX + 16

	prevX := 316.0
	for _, sf := range seqFlows {
		toX := stepCentersX[sf.to]
		fmt.Fprintf(&b,
			"            <bpmndi:BPMNEdge bpmnElement=%q id=%q sourceElement=%q targetElement=%q>\n                <di:waypoint x=\"%.1f\" xsi:type=\"dc:Point\" y=\"210.0\"/>\n                <di:waypoint x=\"%.1f\" xsi:type=\"dc:Point\" y=\"210.0\"/>\n            </bpmndi:BPMNEdge>\n",
			sf.id, "BPMNEdge_"+sf.id,
			"BPMNShape_"+sf.from, "BPMNShape_"+sf.to,
			prevX, toX-10)
		prevX = toX + 50
	}

	fmt.Fprintf(&b, `
            <bpmndi:BPMNEdge bpmnElement="SequenceFlow_EH1" id="BPMNEdge_SequenceFlow_EH1">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
            </bpmndi:BPMNEdge>
            <bpmndi:BPMNEdge bpmnElement="SequenceFlow_EH2" id="BPMNEdge_SequenceFlow_EH2">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
            </bpmndi:BPMNEdge>
`, ehX+52, ehX+100, ehX+200, ehX+260)

	fmt.Fprintf(&b, `
            <bpmndi:BPMNEdge bpmnElement="MessageFlow_Sender" id="BPMNEdge_MessageFlow_Sender">
                <di:waypoint x="160.0" xsi:type="dc:Point" y="210.0"/>
                <di:waypoint x="300.0" xsi:type="dc:Point" y="210.0"/>
            </bpmndi:BPMNEdge>
            <bpmndi:BPMNEdge bpmnElement="MessageFlow_Receiver" id="BPMNEdge_MessageFlow_Receiver">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="210.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="210.0"/>
            </bpmndi:BPMNEdge>
`, endEventX+32, receiverParticipantX)

	b.WriteString(`        </bpmndi:BPMNPlane>
    </bpmndi:BPMNDiagram>
</bpmn2:definitions>
`)

	return b.String()
}

// ── Stubs ──────────────────────────────────────────────────────────────────────

func groovyStub(name string) string {
	return fmt.Sprintf(`import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    // TODO: implement %s logic
    def headers = message.getHeaders()
    return message
}
`, name)
}

func xsltStub() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="xml" indent="yes" encoding="UTF-8"/>
    <!-- TODO: implement field mapping -->
    <xsl:template match="/">
        <root>
            <!-- map source fields here -->
        </root>
    </xsl:template>
</xsl:stylesheet>
`
}

// ── Utilities ──────────────────────────────────────────────────────────────────

// isValidCPIName enforces SAP CPI artifact/package naming rules:
// must start with letter or underscore, may contain letters/digits/spaces/periods/hyphens,
// must not end with a period.
func isValidCPIName(s string) bool {
	if s == "" {
		return false
	}
	first := rune(s[0])
	if !unicode.IsLetter(first) && first != '_' {
		return false
	}
	if s[len(s)-1] == '.' {
		return false
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != ' ' && r != '.' && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

func indexOf(slice []string, val string) int {
	for i, v := range slice {
		if v == val {
			return i
		}
	}
	return -1
}

func sanitizeFilename(name string) string {
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' {
			b.WriteRune('_')
		}
	}
	return b.String()
}
