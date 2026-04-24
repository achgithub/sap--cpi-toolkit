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

		// Hard check: reject non-dev environments regardless of frontend state.
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

		zipBytes, err := generateScaffoldZIP(req)
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

func generateScaffoldZIP(req ScaffoldRequest) ([]byte, error) {
	groovyName := req.GroovyName
	if groovyName == "" {
		groovyName = "script"
	}
	xsltName := req.XSLTName
	if xsltName == "" {
		xsltName = "mapping"
	}
	// Filename-safe iflow name
	safeIFlowName := sanitizeFilename(req.Name)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	files := map[string]string{
		"META-INF/MANIFEST.MF": fmt.Sprintf(
			"Manifest-Version: 1.0\nBundle-ManifestVersion: 2\nBundle-SymbolicName: %s\nBundle-Name: %s\nBundle-Version: 1.0.0\nBundle-Vendor: SAP SE\nSAP-BundleType: IFlow\n",
			req.IFlowID, req.Name,
		),
		"metainfo.prop": fmt.Sprintf(
			"ifl.applicationName=%s\nifl.bundleVersion=1.0.0\nifl.bundleName=%s\nifl.bundleId=%s\nifl.createdAt=%s\n",
			req.IFlowID, req.Name, req.IFlowID, time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		),
		"src/main/resources/parameters.prop":    "",
		"src/main/resources/parameters.propdef": "",
	}

	if req.IncludeGroovy {
		files["src/main/resources/script/"+groovyName+".groovy"] = groovyStub(groovyName)
	}
	if req.IncludeXSLT {
		files["src/main/resources/mapping/"+xsltName+".xsl"] = xsltStub()
	}

	files["src/main/resources/scenarioflows/integrationflow/"+safeIFlowName+".iflw"] = generateIFlowXML(req, groovyName, xsltName)

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

func generateIFlowXML(req ScaffoldRequest, groovyName, xsltName string) string {
	// Build ordered step list (between StartEvent and EndEvent)
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

	// Compute end event X
	lastX := 400.0 + 100 // after ContentModifier
	if len(steps) > 1 {
		last := steps[len(steps)-1]
		lastX = last.X + 100
	}
	endEventX := lastX + 70
	receiverParticipantX := endEventX + 130

	// Compute pool width
	poolWidth := receiverParticipantX - 220 + 60
	if poolWidth < 700 {
		poolWidth = 700
	}

	// Build full ordered ID list for sequence flow chaining
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

	// allowedHeaderList: CamelFileName needed for SFTP flows
	allowedHeaders := ""
	if req.SenderAdapter == "SFTP" || req.ReceiverAdapter == "SFTP" {
		allowedHeaders = "CamelFileName"
	}

	var b strings.Builder

	// ── Document header
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
	fmt.Fprintf(&b, `
    <bpmn2:collaboration id="Collaboration_1" name="Default Collaboration">
        <bpmn2:extensionElements>
            <ifl:property><key>namespaceMapping</key><value/></ifl:property>
            <ifl:property><key>allowedHeaderList</key><value>%s</value></ifl:property>
            <ifl:property><key>httpSessionHandling</key><value>None</value></ifl:property>
            <ifl:property><key>ServerTrace</key><value>false</value></ifl:property>
            <ifl:property><key>returnExceptionToSender</key><value>false</value></ifl:property>
            <ifl:property><key>log</key><value>All events</value></ifl:property>
            <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
            <ifl:property><key>cmdVariantUri</key><value>ctype::IFlowVariant/cname::IFlowConfiguration/version::1.1.16</value></ifl:property>
        </bpmn2:extensionElements>
`, allowedHeaders)

	// Sender participant
	b.WriteString(senderParticipant(req.SenderAdapter))

	// Main process participant
	b.WriteString(`
        <bpmn2:participant id="Participant_Process_1" ifl:type="IntegrationProcess"
            name="Integration Process" processRef="Process_1">
            <bpmn2:extensionElements/>
        </bpmn2:participant>
`)

	// Receiver participant
	b.WriteString(receiverParticipant(req.ReceiverAdapter))

	// Sender message flow
	b.WriteString(senderMessageFlow(req.SenderAdapter))

	// Receiver message flow (sourceRef = EndEvent_1 for async)
	b.WriteString(receiverMessageFlow(req.ReceiverAdapter, "EndEvent_1"))

	b.WriteString("    </bpmn2:collaboration>\n")

	// ── Main process
	lastSFn := lastSF
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

	// Content Modifier (always — set standard headers)
	fmt.Fprintf(&b, `
        <bpmn2:callActivity id="CallActivity_SetHeaders" name="Set Standard Headers">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Enricher</value></ifl:property>
                <ifl:property><key>bodyType</key><value></value></ifl:property>
                <ifl:property><key>wrapContent</key><value></value></ifl:property>
                <ifl:property>
                    <key>headerTable</key>
                    <value>&lt;row&gt;&lt;cell id='Action'&gt;Create&lt;/cell&gt;&lt;cell id='Type'&gt;expression&lt;/cell&gt;&lt;cell id='Value'&gt;${date:now:yyyyMMddHHmmss}_${exchangeId}&lt;/cell&gt;&lt;cell id='Default'&gt;&lt;/cell&gt;&lt;cell id='Name'&gt;SAP_ApplicationID&lt;/cell&gt;&lt;cell id='Datatype'&gt;java.lang.String&lt;/cell&gt;&lt;/row&gt;</value>
                </ifl:property>
                <ifl:property><key>propertyTable</key><value></value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.6</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::Enricher/version::1.6.1</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>SequenceFlow_1</bpmn2:incoming>
            <bpmn2:outgoing>SequenceFlow_2</bpmn2:outgoing>
        </bpmn2:callActivity>
`)

	// Groovy step
	if req.IncludeGroovy {
		sfIn := seqFlows[indexOf(allIDs, "CallActivity_Groovy")-1].id
		sfOut := seqFlows[indexOf(allIDs, "CallActivity_Groovy")].id
		fmt.Fprintf(&b, `
        <bpmn2:callActivity id="CallActivity_Groovy" name="%s">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Script</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>GroovyScript</value></ifl:property>
                <ifl:property><key>script</key><value>%s.groovy</value></ifl:property>
                <ifl:property><key>scriptFunction</key><value>processData</value></ifl:property>
                <ifl:property><key>scriptBundleId</key><value/></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::GroovyScript/version::1.1.2</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>%s</bpmn2:incoming>
            <bpmn2:outgoing>%s</bpmn2:outgoing>
        </bpmn2:callActivity>
`, groovyName, groovyName, sfIn, sfOut)
	}

	// XSLT step
	if req.IncludeXSLT {
		sfIn := seqFlows[indexOf(allIDs, "CallActivity_XSLT")-1].id
		sfOut := seqFlows[indexOf(allIDs, "CallActivity_XSLT")].id
		fmt.Fprintf(&b, `
        <bpmn2:callActivity id="CallActivity_XSLT" name="%s">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Mapping</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>XSLTMapping</value></ifl:property>
                <ifl:property><key>mappingpath</key><value>src/main/resources/mapping/%s.xsl</value></ifl:property>
                <ifl:property><key>mappingoutputformat</key><value>Bytes</value></ifl:property>
                <ifl:property><key>mappingSource</key><value>mappingSrcBody</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.2</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::XSLTMapping/version::1.2.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>%s</bpmn2:incoming>
            <bpmn2:outgoing>%s</bpmn2:outgoing>
        </bpmn2:callActivity>
`, xsltName, xsltName, sfIn, sfOut)
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
`, lastSFn)

	// Exception subprocess (always)
	b.WriteString(`
        <bpmn2:subProcess id="SubProcess_EH" name="Exception Subprocess 1">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>activityType</key><value>ErrorEventSubProcessTemplate</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::ErrorEventSubProcessTemplate/version::1.1.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:startEvent id="ErrorStartEvent_1" name="Error Start 1">
                <bpmn2:outgoing>SequenceFlow_EH1</bpmn2:outgoing>
                <bpmn2:errorEventDefinition>
                    <bpmn2:extensionElements>
                        <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::ErrorStartEvent</value></ifl:property>
                        <ifl:property><key>activityType</key><value>StartErrorEvent</value></ifl:property>
                    </bpmn2:extensionElements>
                </bpmn2:errorEventDefinition>
            </bpmn2:startEvent>
            <bpmn2:callActivity id="CallActivity_EH" name="Handle Error">
                <bpmn2:extensionElements>
                    <ifl:property><key>activityType</key><value>Enricher</value></ifl:property>
                    <ifl:property><key>bodyType</key><value>expression</value></ifl:property>
                    <ifl:property><key>wrapContent</key><value>${exception.message}</value></ifl:property>
                    <ifl:property><key>headerTable</key><value></value></ifl:property>
                    <ifl:property><key>propertyTable</key><value></value></ifl:property>
                    <ifl:property><key>componentVersion</key><value>1.6</value></ifl:property>
                    <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::Enricher/version::1.6.1</value></ifl:property>
                </bpmn2:extensionElements>
                <bpmn2:incoming>SequenceFlow_EH1</bpmn2:incoming>
                <bpmn2:outgoing>SequenceFlow_EH2</bpmn2:outgoing>
            </bpmn2:callActivity>
            <bpmn2:endEvent id="EndEvent_EH" name="End Error">
                <bpmn2:extensionElements>
                    <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                    <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageEndEvent/version::1.1.0</value></ifl:property>
                </bpmn2:extensionElements>
                <bpmn2:incoming>SequenceFlow_EH2</bpmn2:incoming>
                <bpmn2:messageEventDefinition/>
            </bpmn2:endEvent>
            <bpmn2:sequenceFlow id="SequenceFlow_EH1" sourceRef="ErrorStartEvent_1" targetRef="CallActivity_EH"/>
            <bpmn2:sequenceFlow id="SequenceFlow_EH2" sourceRef="CallActivity_EH" targetRef="EndEvent_EH"/>
        </bpmn2:subProcess>
`)

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

	// Shapes for steps
	for _, s := range steps {
		fmt.Fprintf(&b,
			"            <bpmndi:BPMNShape bpmnElement=%q id=%q>\n                <dc:Bounds height=\"60.0\" width=\"100.0\" x=\"%.1f\" y=\"%.1f\"/>\n            </bpmndi:BPMNShape>\n",
			s.ID, "BPMNShape_"+s.ID, s.X, s.Y)
	}

	// End event shape
	fmt.Fprintf(&b,
		"            <bpmndi:BPMNShape bpmnElement=\"EndEvent_1\" id=\"BPMNShape_EndEvent_1\">\n                <dc:Bounds height=\"32.0\" width=\"32.0\" x=\"%.1f\" y=\"194.0\"/>\n            </bpmndi:BPMNShape>\n",
		endEventX)

	// Exception subprocess shapes
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

	// Sequence flow edges
	stepCentersX := map[string]float64{
		"StartEvent_1": 316,
	}
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

	// Exception subprocess edges
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

	// Message flow edges
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

// ── Participant helpers ────────────────────────────────────────────────────────

func senderParticipant(adapter string) string {
	return `
        <bpmn2:participant id="Participant_Sender" ifl:type="EndpointSender" name="Sender1">
            <bpmn2:extensionElements>
                <ifl:property><key>enableBasicAuthentication</key><value>false</value></ifl:property>
                <ifl:property><key>ifl:type</key><value>EndpointSender</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>
`
}

func receiverParticipant(adapter string) string {
	if adapter == "SFTP" {
		return `
        <bpmn2:participant id="Participant_Receiver" ifl:type="EndpointRecevier" name="Receiver1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>EndpointRecevier</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>
`
	}
	return `
        <bpmn2:participant id="Participant_Receiver" name="Receiver1"/>
`
}

// ── MessageFlow helpers ────────────────────────────────────────────────────────

func senderMessageFlow(adapter string) string {
	if adapter == "SFTP" {
		return `
        <bpmn2:messageFlow id="MessageFlow_Sender" name="SFTP"
            sourceRef="Participant_Sender" targetRef="StartEvent_1">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>SFTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.20</value></ifl:property>
                <ifl:property><key>Name</key><value>SFTP</value></ifl:property>
                <ifl:property><key>system</key><value>Sender1</value></ifl:property>
                <ifl:property><key>direction</key><value>Sender</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>host</key><value>ZZHOST</value></ifl:property>
                <ifl:property><key>authentication</key><value>user_password</value></ifl:property>
                <ifl:property><key>credential_name</key><value>ZZCREDENTIALNAME</value></ifl:property>
                <ifl:property><key>username</key><value/></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>ZZDIRECTORY</value></ifl:property>
                <ifl:property><key>fileName</key><value>*</value></ifl:property>
                <ifl:property><key>regex_filter</key><value>0</value></ifl:property>
                <ifl:property><key>recursive</key><value>0</value></ifl:property>
                <ifl:property><key>stepwise</key><value>0</value></ifl:property>
                <ifl:property><key>flatten</key><value/></ifl:property>
                <ifl:property><key>noop</key><value>delete</value></ifl:property>
                <ifl:property><key>file.move</key><value>.archive</value></ifl:property>
                <ifl:property><key>doneFileName</key><value>${file:name}.done</value></ifl:property>
                <ifl:property><key>scheduleKey</key><value>&lt;row&gt;&lt;cell&gt;dateType&lt;/cell&gt;&lt;cell&gt;DAILY&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;secondValue&lt;/cell&gt;&lt;cell&gt;0&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;toInterval&lt;/cell&gt;&lt;cell&gt;1&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;fromInterval&lt;/cell&gt;&lt;cell&gt;0&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;OnEveryHour&lt;/cell&gt;&lt;cell&gt;1&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;timeType&lt;/cell&gt;&lt;cell&gt;TIME_HOUR_INTERVAL&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;timeZone&lt;/cell&gt;&lt;cell&gt;( UTC -10:00 ) Hawaii Standard Time(HST)&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;throwExceptionOnExpiry&lt;/cell&gt;&lt;cell&gt;true&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;triggerType&lt;/cell&gt;&lt;cell&gt;cron&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;noOfSchedules&lt;/cell&gt;&lt;cell&gt;1&lt;/cell&gt;&lt;/row&gt;&lt;row&gt;&lt;cell&gt;schedule1&lt;/cell&gt;&lt;cell&gt;0+0+0+?+*+*+*&amp;amp;trigger.timeZone=HST&lt;/cell&gt;&lt;/row&gt;</value></ifl:property>
                <ifl:property><key>maxMessagesPerPoll</key><value>20</value></ifl:property>
                <ifl:property><key>maximumFileSize</key><value>40</value></ifl:property>
                <ifl:property><key>disconnect</key><value>1</value></ifl:property>
                <ifl:property><key>readLock</key><value>none</value></ifl:property>
                <ifl:property><key>idempotentRepository</key><value>database</value></ifl:property>
                <ifl:property><key>emptyFileHandling</key><value>processFile</value></ifl:property>
                <ifl:property><key>stopOnException</key><value>1</value></ifl:property>
                <ifl:property><key>useClusterLock</key><value>0</value></ifl:property>
                <ifl:property><key>fastExistsCheck</key><value>1</value></ifl:property>
                <ifl:property><key>allowDeprecatedAlgorithms</key><value>0</value></ifl:property>
                <ifl:property><key>location_id</key><value/></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>SFTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>File</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:SFTP/tp::SFTP/mp::File/direction::Sender/version::1.20.1</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>
`
	}
	// Default: HTTPS
	return `
        <bpmn2:messageFlow id="MessageFlow_Sender" name="HTTPS"
            sourceRef="Participant_Sender" targetRef="StartEvent_1">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.5</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>system</key><value>Sender1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>urlPath</key><value>ZZURLPATH</value></ifl:property>
                <ifl:property><key>senderAuthType</key><value>RoleBased</value></ifl:property>
                <ifl:property><key>userRole</key><value>ESBMessaging.send</value></ifl:property>
                <ifl:property><key>xsrfProtection</key><value>1</value></ifl:property>
                <ifl:property><key>maximumBodySize</key><value>40</value></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>None</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:HTTPS/tp::HTTPS/mp::None/direction::Sender/version::1.5.2</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>
`
}

func receiverMessageFlow(adapter, sourceRef string) string {
	if adapter == "SFTP" {
		return fmt.Sprintf(`
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="SFTP"
            sourceRef="%s" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>SFTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.13</value></ifl:property>
                <ifl:property><key>Name</key><value>SFTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>direction</key><value>Receiver</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>host</key><value>ZZHOST</value></ifl:property>
                <ifl:property><key>authentication</key><value>public_key</value></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value>ZZPRIVATEKEYALIAS</value></ifl:property>
                <ifl:property><key>username</key><value>ZZUSERNAME</value></ifl:property>
                <ifl:property><key>credential_name</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>ZZDIRECTORY</value></ifl:property>
                <ifl:property><key>fileName</key><value>${header.CamelFileName}</value></ifl:property>
                <ifl:property><key>fileExist</key><value>Override</value></ifl:property>
                <ifl:property><key>autoCreate</key><value>1</value></ifl:property>
                <ifl:property><key>stepwise</key><value>1</value></ifl:property>
                <ifl:property><key>useTempFile</key><value>0</value></ifl:property>
                <ifl:property><key>disconnect</key><value>1</value></ifl:property>
                <ifl:property><key>maximumFileSize</key><value>40</value></ifl:property>
                <ifl:property><key>fastExistsCheck</key><value>1</value></ifl:property>
                <ifl:property><key>allowDeprecatedAlgorithms</key><value>0</value></ifl:property>
                <ifl:property><key>location_id</key><value/></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>SFTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>File</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:SFTP/tp::SFTP/mp::File/direction::Receiver/version::1.13.3</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>
`, sourceRef)
	}
	// Default: HTTP
	return fmt.Sprintf(`
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="HTTP"
            sourceRef="%s" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.10</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>address</key><value>ZZURL</value></ifl:property>
                <ifl:property><key>httpMethod</key><value>POST</value></ifl:property>
                <ifl:property><key>authType</key><value>BasicAuthentication</value></ifl:property>
                <ifl:property><key>credentialName</key><value>ZZCREDENTIALNAME</value></ifl:property>
                <ifl:property><key>httpRequestTimeout</key><value>60000</value></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>HTTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>None</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:HTTP/tp::HTTP/mp::None/direction::Receiver/version::1.10.0</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>
`, sourceRef)
}

// ── Stubs ──────────────────────────────────────────────────────────────────────

func groovyStub(name string) string {
	return fmt.Sprintf(`import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    // TODO: implement %s logic
    // Use message.getBody(java.io.Reader) for XML body parsing
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
