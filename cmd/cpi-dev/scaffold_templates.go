package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	texttemplate "text/template"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Template data ──────────────────────────────────────────────────────────────

// scaffoldTmplData is passed to every XML fragment template.
type scaffoldTmplData struct {
	AllowedHeaders string // collaboration_ext
	SFIn           string // incoming sequence flow ID for step templates
	SFOut          string // outgoing sequence flow ID for step templates
	GroovyName     string // step_groovy
	XSLTName       string // step_xslt
	SourceRef      string // receiver_messageflow_* sourceRef attribute
	// Adapter properties
	HTTPSUrlPath          string // sender_messageflow_HTTPS
	SFTPSenderHost        string // sender_messageflow_SFTP
	SFTPSenderCredential  string // sender_messageflow_SFTP
	SFTPSenderDirectory   string // sender_messageflow_SFTP
	SFTPSenderScheduleXML string // sender_messageflow_SFTP — pre-encoded scheduleKey value
	HTTPReceiverURL       string // receiver_messageflow_HTTP
	HTTPReceiverCredential string // receiver_messageflow_HTTP
	SFTPReceiverHost      string // receiver_messageflow_SFTP
	SFTPReceiverPrivateKey string // receiver_messageflow_SFTP
	SFTPReceiverUsername  string // receiver_messageflow_SFTP
	SFTPReceiverDirectory string // receiver_messageflow_SFTP
}

type tmplDef struct {
	Label     string
	Variables []string
	Body      string
}

// ── Default templates ──────────────────────────────────────────────────────────
// Seeded into w_scaffold_templates on first start. Override via the UI without
// rebuilding. Use {{.FieldName}} for dynamic values — see Variables list.

var defaultScaffoldTemplates = map[string]tmplDef{

	"collaboration_ext": {
		Label:     "Collaboration Extension Elements",
		Variables: []string{"AllowedHeaders"},
		Body: `        <bpmn2:extensionElements>
            <ifl:property><key>namespaceMapping</key><value/></ifl:property>
            <ifl:property><key>allowedHeaderList</key><value>{{.AllowedHeaders}}</value></ifl:property>
            <ifl:property><key>httpSessionHandling</key><value>None</value></ifl:property>
            <ifl:property><key>ServerTrace</key><value>false</value></ifl:property>
            <ifl:property><key>returnExceptionToSender</key><value>false</value></ifl:property>
            <ifl:property><key>log</key><value>All events</value></ifl:property>
            <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
            <ifl:property><key>cmdVariantUri</key><value>ctype::IFlowVariant/cname::IFlowConfiguration/version::1.1.16</value></ifl:property>
        </bpmn2:extensionElements>`,
	},

	"sender_participant_HTTPS": {
		Label:     "HTTPS Sender Participant",
		Variables: nil,
		Body: `
        <bpmn2:participant id="Participant_Sender" ifl:type="EndpointSender" name="Sender1">
            <bpmn2:extensionElements>
                <ifl:property><key>enableBasicAuthentication</key><value>false</value></ifl:property>
                <ifl:property><key>ifl:type</key><value>EndpointSender</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,
	},

	"sender_participant_SFTP": {
		Label:     "SFTP Sender Participant",
		Variables: nil,
		Body: `
        <bpmn2:participant id="Participant_Sender" ifl:type="IflSender" name="Sender1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>IflSender</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,
	},

	"receiver_participant_HTTP": {
		Label:     "HTTP Receiver Participant",
		Variables: nil,
		Body:      "\n        <bpmn2:participant id=\"Participant_Receiver\" name=\"Receiver1\"/>",
	},

	"receiver_participant_SFTP": {
		Label:     "SFTP Receiver Participant",
		Variables: nil,
		Body: `
        <bpmn2:participant id="Participant_Receiver" ifl:type="EndpointRecevier" name="Receiver1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>EndpointRecevier</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,
	},

	"sender_messageflow_HTTPS": {
		Label:     "HTTPS Sender Adapter",
		Variables: []string{"HTTPSUrlPath"},
		Body: `
        <bpmn2:messageFlow id="MessageFlow_Sender" name="HTTPS"
            sourceRef="Participant_Sender" targetRef="StartEvent_1">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.5</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>system</key><value>Sender1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>urlPath</key><value>{{.HTTPSUrlPath}}</value></ifl:property>
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
        </bpmn2:messageFlow>`,
	},

	"sender_messageflow_SFTP": {
		Label:     "SFTP Sender Adapter",
		Variables: []string{"SFTPSenderHost", "SFTPSenderCredential", "SFTPSenderDirectory", "SFTPSenderScheduleXML"},
		Body: `
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
                <ifl:property><key>host</key><value>{{.SFTPSenderHost}}</value></ifl:property>
                <ifl:property><key>authentication</key><value>user_password</value></ifl:property>
                <ifl:property><key>credential_name</key><value>{{.SFTPSenderCredential}}</value></ifl:property>
                <ifl:property><key>username</key><value/></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>{{.SFTPSenderDirectory}}</value></ifl:property>
                <ifl:property><key>fileName</key><value>*</value></ifl:property>
                <ifl:property><key>regex_filter</key><value>0</value></ifl:property>
                <ifl:property><key>recursive</key><value>0</value></ifl:property>
                <ifl:property><key>stepwise</key><value>0</value></ifl:property>
                <ifl:property><key>flatten</key><value/></ifl:property>
                <ifl:property><key>noop</key><value>delete</value></ifl:property>
                <ifl:property><key>file.move</key><value>.archive</value></ifl:property>
                <ifl:property><key>doneFileName</key><value>${file:name}.done</value></ifl:property>
                <ifl:property><key>scheduleKey</key><value>{{.SFTPSenderScheduleXML}}</value></ifl:property>
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
        </bpmn2:messageFlow>`,
	},

	"receiver_messageflow_HTTP": {
		Label:     "HTTP Receiver Adapter",
		Variables: []string{"SourceRef", "HTTPReceiverURL", "HTTPReceiverCredential"},
		Body: `
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="HTTP"
            sourceRef="{{.SourceRef}}" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.10</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>address</key><value>{{.HTTPReceiverURL}}</value></ifl:property>
                <ifl:property><key>httpMethod</key><value>POST</value></ifl:property>
                <ifl:property><key>authType</key><value>BasicAuthentication</value></ifl:property>
                <ifl:property><key>credentialName</key><value>{{.HTTPReceiverCredential}}</value></ifl:property>
                <ifl:property><key>httpRequestTimeout</key><value>60000</value></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>HTTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>None</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.10.0</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:HTTP/tp::HTTP/mp::None/direction::Receiver/version::1.10.0</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>`,
	},

	"receiver_messageflow_SFTP": {
		Label:     "SFTP Receiver Adapter",
		Variables: []string{"SourceRef", "SFTPReceiverHost", "SFTPReceiverPrivateKey", "SFTPReceiverUsername", "SFTPReceiverDirectory"},
		Body: `
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="SFTP"
            sourceRef="{{.SourceRef}}" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>SFTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.13</value></ifl:property>
                <ifl:property><key>Name</key><value>SFTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>direction</key><value>Receiver</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>host</key><value>{{.SFTPReceiverHost}}</value></ifl:property>
                <ifl:property><key>authentication</key><value>public_key</value></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value>{{.SFTPReceiverPrivateKey}}</value></ifl:property>
                <ifl:property><key>username</key><value>{{.SFTPReceiverUsername}}</value></ifl:property>
                <ifl:property><key>credential_name</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>{{.SFTPReceiverDirectory}}</value></ifl:property>
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
        </bpmn2:messageFlow>`,
	},

	"step_content_modifier": {
		Label:     "Content Modifier (Set Standard Headers)",
		Variables: []string{"SFIn", "SFOut"},
		Body: `
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
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,
	},

	"step_groovy": {
		Label:     "Groovy Script Step",
		Variables: []string{"GroovyName", "SFIn", "SFOut"},
		Body: `
        <bpmn2:callActivity id="CallActivity_Groovy" name="{{.GroovyName}}">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Script</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>GroovyScript</value></ifl:property>
                <ifl:property><key>script</key><value>{{.GroovyName}}.groovy</value></ifl:property>
                <ifl:property><key>scriptFunction</key><value>processData</value></ifl:property>
                <ifl:property><key>scriptBundleId</key><value/></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::GroovyScript/version::1.1.2</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,
	},

	"step_xslt": {
		Label:     "XSLT Mapping Step",
		Variables: []string{"XSLTName", "SFIn", "SFOut"},
		Body: `
        <bpmn2:callActivity id="CallActivity_XSLT" name="{{.XSLTName}}">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Mapping</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>XSLTMapping</value></ifl:property>
                <ifl:property><key>mappingpath</key><value>src/main/resources/mapping/{{.XSLTName}}.xsl</value></ifl:property>
                <ifl:property><key>mappingoutputformat</key><value>Bytes</value></ifl:property>
                <ifl:property><key>mappingSource</key><value>mappingSrcBody</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.2</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::XSLTMapping/version::1.2.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,
	},

	"step_exception_subprocess": {
		Label:     "Exception Subprocess",
		Variables: nil,
		Body: `
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
        </bpmn2:subProcess>`,
	},
}

// ── Render ─────────────────────────────────────────────────────────────────────

// renderScaffoldFragment renders a named XML fragment template with the given data.
// Falls back to the compiled default if the DB override is empty or missing.
func renderScaffoldFragment(tmplMap map[string]string, key string, data scaffoldTmplData) string {
	src, ok := tmplMap[key]
	if !ok || src == "" {
		if def, ok2 := defaultScaffoldTemplates[key]; ok2 {
			src = def.Body
		}
	}
	t, err := texttemplate.New("").Parse(src)
	if err != nil {
		return fmt.Sprintf("<!-- template %s parse error: %s -->", key, err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return fmt.Sprintf("<!-- template %s render error: %s -->", key, err)
	}
	return buf.String()
}

// loadAllScaffoldTemplates loads DB overrides; absent keys fall back to defaults in renderScaffoldFragment.
func loadAllScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool) map[string]string {
	result := make(map[string]string)
	rows, err := pool.Query(ctx, `SELECT key, body FROM w_scaffold_templates WHERE body <> ''`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, b string
			if rows.Scan(&k, &b) == nil {
				result[k] = b
			}
		}
	}
	return result
}

// seedScaffoldTemplates inserts default templates on first startup (no overwrite).
func seedScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool) error {
	for key, def := range defaultScaffoldTemplates {
		if _, err := pool.Exec(ctx,
			`INSERT INTO w_scaffold_templates (key, label, body) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
			key, def.Label, def.Body,
		); err != nil {
			return fmt.Errorf("seed %s: %w", key, err)
		}
	}
	return nil
}

// ── Template CRUD routes ───────────────────────────────────────────────────────

type scaffoldTemplateRow struct {
	Key       string   `json:"key"`
	Label     string   `json:"label"`
	Variables []string `json:"variables"`
	Body      string   `json:"body"`
}

func registerScaffoldTemplateRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.HandleFunc("/scaffold/templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			dbBodies := loadAllScaffoldTemplates(r.Context(), pool)
			keys := make([]string, 0, len(defaultScaffoldTemplates))
			for k := range defaultScaffoldTemplates {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			var rows []scaffoldTemplateRow
			for _, key := range keys {
				def := defaultScaffoldTemplates[key]
				body := def.Body
				if db, ok := dbBodies[key]; ok && db != "" {
					body = db
				}
				rows = append(rows, scaffoldTemplateRow{Key: key, Label: def.Label, Variables: def.Variables, Body: body})
			}
			writeJSON(w, rows)

		case http.MethodPut:
			var req struct {
				Key  string `json:"key"`
				Body string `json:"body"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				jsonError(w, "invalid body", http.StatusBadRequest)
				return
			}
			if _, ok := defaultScaffoldTemplates[req.Key]; !ok {
				jsonError(w, "unknown template key: "+req.Key, http.StatusBadRequest)
				return
			}
			_, err := pool.Exec(r.Context(),
				`INSERT INTO w_scaffold_templates (key, label, body) VALUES ($1, $2, $3)
				 ON CONFLICT (key) DO UPDATE SET body = $3, updated_at = NOW()`,
				req.Key, defaultScaffoldTemplates[req.Key].Label, req.Body,
			)
			if err != nil {
				jsonError(w, "db error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)

		default:
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/scaffold/templates/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Key string `json:"key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		def, ok := defaultScaffoldTemplates[req.Key]
		if !ok {
			jsonError(w, "unknown key", http.StatusBadRequest)
			return
		}
		_, err := pool.Exec(r.Context(),
			`INSERT INTO w_scaffold_templates (key, label, body) VALUES ($1, $2, $3)
			 ON CONFLICT (key) DO UPDATE SET body = $3, updated_at = NOW()`,
			req.Key, def.Label, def.Body,
		)
		if err != nil {
			jsonError(w, "db error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

// ── Upload preflight ───────────────────────────────────────────────────────────

type preflightResult struct {
	PackageID     string `json:"package_id"`
	PackageExists bool   `json:"package_exists"`
	IFlowID       string `json:"iflow_id"`
	IFlowExists   bool   `json:"iflow_exists"`
}

func makeScaffoldPreflightHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		var apiKeyRaw []byte
		if err := pool.QueryRow(r.Context(),
			`SELECT api_key FROM w_cpi_instances WHERE id = $1`, req.InstanceID,
		).Scan(&apiKeyRaw); err != nil || len(apiKeyRaw) == 0 {
			jsonError(w, "instance has no api_key configured", http.StatusBadRequest)
			return
		}
		var apiKey struct {
			OAuth struct {
				ClientID     string `json:"clientid"`
				ClientSecret string `json:"clientsecret"`
				TokenURL     string `json:"tokenurl"`
				URL          string `json:"url"`
			} `json:"oauth"`
		}
		if err := json.Unmarshal(apiKeyRaw, &apiKey); err != nil || apiKey.OAuth.URL == "" {
			jsonError(w, "invalid api_key format", http.StatusBadRequest)
			return
		}

		token, err := getOAuthToken(r.Context(), req.InstanceID, apiKey.OAuth.TokenURL, apiKey.OAuth.ClientID, apiKey.OAuth.ClientSecret)
		if err != nil {
			jsonError(w, "OAuth error: "+err.Error(), http.StatusBadGateway)
			return
		}

		apiBase := strings.TrimRight(apiKey.OAuth.URL, "/")
		client := &http.Client{Timeout: 15 * time.Second}

		// Check package
		pkgReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet,
			fmt.Sprintf("%s/api/v1/IntegrationPackages('%s')?$format=json", apiBase, req.PackageID), nil)
		pkgReq.Header.Set("Authorization", "Bearer "+token)
		pkgReq.Header.Set("Accept", "application/json")
		pkgResp, err := client.Do(pkgReq)
		if err != nil {
			jsonError(w, "package check failed: "+err.Error(), http.StatusBadGateway)
			return
		}
		pkgResp.Body.Close()
		pkgExists := pkgResp.StatusCode == http.StatusOK

		// Check iFlow
		iflowReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet,
			fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')?$format=json", apiBase, req.IFlowID), nil)
		iflowReq.Header.Set("Authorization", "Bearer "+token)
		iflowReq.Header.Set("Accept", "application/json")
		iflowResp, err := client.Do(iflowReq)
		if err != nil {
			jsonError(w, "iflow check failed: "+err.Error(), http.StatusBadGateway)
			return
		}
		iflowResp.Body.Close()
		iflowExists := iflowResp.StatusCode == http.StatusOK

		writeJSON(w, preflightResult{
			PackageID:     req.PackageID,
			PackageExists: pkgExists,
			IFlowID:       req.IFlowID,
			IFlowExists:   iflowExists,
		})
	}
}

// ── Upload to CPI tenant ───────────────────────────────────────────────────────

func makeScaffoldUploadHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		if req.Name == "" || req.IFlowID == "" || req.PackageID == "" {
			jsonError(w, "name, iflow_id, and package_id are required", http.StatusBadRequest)
			return
		}
		if !isValidCPIName(req.IFlowID) {
			jsonError(w, "iflow_id must start with a letter or underscore and contain only letters, digits, spaces, periods, or hyphens — and must not end with a period", http.StatusBadRequest)
			return
		}
		if !isValidCPIName(req.PackageID) {
			jsonError(w, "package_id must start with a letter or underscore and contain only letters, digits, spaces, periods, or hyphens — and must not end with a period", http.StatusBadRequest)
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
			jsonError(w, fmt.Sprintf("upload not permitted for %s environment", systemType), http.StatusForbidden)
			return
		}

		var apiKeyRaw []byte
		if err := pool.QueryRow(r.Context(),
			`SELECT api_key FROM w_cpi_instances WHERE id = $1`, req.InstanceID,
		).Scan(&apiKeyRaw); err != nil || len(apiKeyRaw) == 0 {
			jsonError(w, "instance has no api_key configured", http.StatusBadRequest)
			return
		}
		var apiKey struct {
			OAuth struct {
				ClientID     string `json:"clientid"`
				ClientSecret string `json:"clientsecret"`
				TokenURL     string `json:"tokenurl"`
				URL          string `json:"url"`
			} `json:"oauth"`
		}
		if err := json.Unmarshal(apiKeyRaw, &apiKey); err != nil || apiKey.OAuth.URL == "" {
			jsonError(w, "invalid api_key format", http.StatusBadRequest)
			return
		}

		token, err := getOAuthToken(r.Context(), req.InstanceID, apiKey.OAuth.TokenURL, apiKey.OAuth.ClientID, apiKey.OAuth.ClientSecret)
		if err != nil {
			jsonError(w, "OAuth error: "+err.Error(), http.StatusBadGateway)
			return
		}

		apiBase := strings.TrimRight(apiKey.OAuth.URL, "/")

		csrfToken, err := fetchCPICSRFToken(r.Context(), apiBase, token)
		if err != nil {
			jsonError(w, "CSRF fetch error: "+err.Error(), http.StatusBadGateway)
			return
		}

		tmplMap := loadAllScaffoldTemplates(r.Context(), pool)
		zipBytes, err := generateScaffoldZIP(req, tmplMap)
		if err != nil {
			jsonError(w, "generation failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		if err := ensureCPIPackage(r.Context(), apiBase, token, csrfToken, req.PackageID, req.PackageName); err != nil {
			jsonError(w, "package error: "+err.Error(), http.StatusBadGateway)
			return
		}

		b64zip := base64.StdEncoding.EncodeToString(zipBytes)
		client := &http.Client{Timeout: 60 * time.Second}

		action, err := upsertCPIArtifact(r.Context(), client, apiBase, token, csrfToken, req, b64zip)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadGateway)
			return
		}

		writeJSON(w, map[string]string{
			"message":  fmt.Sprintf("iFlow '%s' %s in package '%s'", req.IFlowID, action, req.PackageID),
			"iflow_id": req.IFlowID,
		})
	}
}

// upsertCPIArtifact checks if the iFlow already exists and creates or updates accordingly.
// Returns "created" or "updated" on success.
func upsertCPIArtifact(ctx context.Context, client *http.Client, apiBase, token, csrfToken string, req ScaffoldRequest, b64zip string) (string, error) {
	// Check existence
	checkURL := fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')", apiBase, req.IFlowID)
	checkReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, checkURL, nil)
	checkReq.Header.Set("Authorization", "Bearer "+token)
	checkReq.Header.Set("Accept", "application/json")
	checkResp, err := client.Do(checkReq)
	if err != nil {
		return "", fmt.Errorf("existence check failed: %w", err)
	}
	checkResp.Body.Close()
	exists := checkResp.StatusCode == http.StatusOK

	if exists {
		// PUT to update
		body, _ := json.Marshal(map[string]string{
			"Name":            req.Name,
			"PackageId":       req.PackageID,
			"Description":     req.Description,
			"ArtifactContent": b64zip,
		})
		putURL := fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')", apiBase, req.IFlowID)
		putReq, _ := http.NewRequestWithContext(ctx, http.MethodPut, putURL, bytes.NewReader(body))
		putReq.Header.Set("Authorization", "Bearer "+token)
		putReq.Header.Set("Content-Type", "application/json")
		putReq.Header.Set("Accept", "application/json")
		putReq.Header.Set("X-CSRF-Token", csrfToken)
		resp, err := client.Do(putReq)
		if err != nil {
			return "", fmt.Errorf("update failed: %w", err)
		}
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusNoContent {
			return "", fmt.Errorf("CPI update returned %d: %s", resp.StatusCode, string(respBody))
		}
		return "updated", nil
	}

	// POST to create
	body, _ := json.Marshal(map[string]string{
		"Id":              req.IFlowID,
		"Name":            req.Name,
		"PackageId":       req.PackageID,
		"Description":     req.Description,
		"ArtifactContent": b64zip,
	})
	postURL := apiBase + "/api/v1/IntegrationDesigntimeArtifacts"
	postReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, postURL, bytes.NewReader(body))
	postReq.Header.Set("Authorization", "Bearer "+token)
	postReq.Header.Set("Content-Type", "application/json")
	postReq.Header.Set("Accept", "application/json")
	postReq.Header.Set("X-CSRF-Token", csrfToken)
	resp, err := client.Do(postReq)
	if err != nil {
		return "", fmt.Errorf("create failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("CPI create returned %d: %s", resp.StatusCode, string(respBody))
	}
	return "created", nil
}

func fetchCPICSRFToken(ctx context.Context, apiBase, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBase+"/api/v1/IntegrationPackages?$top=1&$format=json", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-CSRF-Token", "Fetch")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()

	csrf := resp.Header.Get("X-CSRF-Token")
	if csrf == "" || csrf == "Required" {
		return "", fmt.Errorf("no X-CSRF-Token returned (got: %q)", csrf)
	}
	return csrf, nil
}

func ensureCPIPackage(ctx context.Context, apiBase, token, csrfToken, pkgID, pkgName string) error {
	client := &http.Client{Timeout: 15 * time.Second}

	checkReq, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/api/v1/IntegrationPackages('%s')", apiBase, pkgID), nil)
	checkReq.Header.Set("Authorization", "Bearer "+token)
	checkReq.Header.Set("Accept", "application/json")
	resp, err := client.Do(checkReq)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return nil
	}

	name := pkgName
	if name == "" {
		name = pkgID
	}
	body, _ := json.Marshal(map[string]string{
		"Id":                pkgID,
		"Name":              name,
		"ShortText":         name,
		"Description":       "",
		"Version":           "1.0.0",
		"Vendor":            "",
		"SupportedPlatform": "SAP Cloud Integration",
	})
	createReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/api/v1/IntegrationPackages", bytes.NewReader(body))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Accept", "application/json")
	createReq.Header.Set("X-CSRF-Token", csrfToken)

	createResp, err := client.Do(createReq)
	if err != nil {
		return err
	}
	defer createResp.Body.Close()
	respBody, _ := io.ReadAll(createResp.Body)
	if createResp.StatusCode != http.StatusCreated && createResp.StatusCode != http.StatusOK {
		return fmt.Errorf("create package returned %d: %s", createResp.StatusCode, string(respBody))
	}
	return nil
}
