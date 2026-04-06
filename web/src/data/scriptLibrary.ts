export type Complexity = 'Beginner' | 'Intermediate' | 'Advanced'

export interface LibraryScript {
  id:          string
  title:       string
  description: string
  complexity:  Complexity
  tags:        string[]
  tenantOnly?: boolean   // requires ITApiFactory — won't work in the IDE, only on a deployed tenant
  body:        string
}

export const ALL_TAGS = [
  'Logging', 'Debugging', 'XML', 'JSON', 'HTTP',
  'Error Handling', 'Routing', 'Encoding', 'Date/Time',
  'OData', 'Attachments', 'IDoc', 'Security', 'Conversion',
]

export const SCRIPTS: LibraryScript[] = [

  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    id: 'log-payload-mpl',
    title: 'Log Payload as MPL Attachment',
    description:
      'Writes the current message body to the Message Processing Log as a named attachment. ' +
      'The attachment appears in the CPI Monitoring UI under the message run. ' +
      'Every CPI developer uses this daily for debugging.',
    complexity: 'Beginner',
    tags: ['Logging', 'Debugging'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def body = message.getBody(String) as String

    def mpl = messageLogFactory.getMessageLog(message)
    if (mpl != null) {
        mpl.setStringProperty("Logged", "true")
        mpl.addAttachmentAsString("Payload", body, "text/plain")
    }

    return message
}`,
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    id: 'log-headers-properties',
    title: 'Log All Headers and Properties',
    description:
      'Dumps every message header and exchange property into a single MPL attachment. ' +
      'Invaluable when debugging why a Router condition is not matching or what values ' +
      'an adapter has set on the message.',
    complexity: 'Beginner',
    tags: ['Logging', 'Debugging'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def mpl = messageLogFactory.getMessageLog(message)
    if (mpl == null) return message

    def sb = new StringBuilder()

    sb.append("=== HEADERS ").append("=".multiply(60)).append("\\n")
    message.getHeaders().each { key, val ->
        sb.append(String.format("  %-45s %s%n", key, val))
    }

    sb.append("\\n=== PROPERTIES ").append("=".multiply(57)).append("\\n")
    message.getProperties().each { key, val ->
        sb.append(String.format("  %-45s %s%n", key, val))
    }

    mpl.addAttachmentAsString("MessageContext", sb.toString(), "text/plain")
    return message
}`,
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    id: 'secure-credentials',
    title: 'Read Credentials from Secure Store',
    description:
      'Retrieves a username and password from a named User Credentials artifact stored ' +
      'in CPI Security Material. The retrieved values are set as exchange properties ' +
      'for use by downstream HTTP adapters or script steps.',
    complexity: 'Intermediate',
    tags: ['Security'],
    tenantOnly: true,
    body: `// ⚠  TENANT-ONLY SCRIPT
// Uses ITApiFactory / SecureStoreService, which are only available inside a real
// CPI runtime. The API calls are commented out so this script runs in the IDE
// without errors, but you must deploy it to a CPI iFlow to use the Secure Store.

import com.sap.gateway.ip.core.customdev.util.Message
// import com.sap.it.api.ITApiFactory
// import com.sap.it.api.securestore.SecureStoreService

def Message processData(Message message) {
    def props = message.getProperties()

    // Name of the User Credentials artifact in CPI Security Material
    def alias = (props.get("CredentialAlias") ?: "MySystemCredential") as String

    // ── Uncomment the block below when deployed on a CPI tenant ───────────
    // def svc  = ITApiFactory.getService(SecureStoreService.class, null)
    // def cred = svc.getUserCredential(alias)
    // if (cred == null) {
    //     throw new Exception("Credential not found in Secure Store: " + alias)
    // }
    // message.setProperty("BackendUser",     cred.getUsername().toString())
    // message.setProperty("BackendPassword", new String(cred.getPassword()))
    // ─────────────────────────────────────────────────────────────────────

    // Placeholder values used when running in the local IDE
    message.setProperty("BackendUser",     "testuser")
    message.setProperty("BackendPassword", "testpass")

    return message
}`,
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    id: 'http-lookup-basic-auth',
    title: 'Call External REST API with Basic Auth',
    description:
      'Makes a synchronous HTTP GET call to a REST endpoint from inside a Script step, ' +
      'using Basic Authentication. Useful for lookup calls (e.g., resolve a material number ' +
      'against a catalogue API) that sit inside a larger message flow.',
    complexity: 'Intermediate',
    tags: ['HTTP', 'JSON'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper

def Message processData(Message message) {
    def props = message.getProperties()

    def url      = (props.get("LookupUrl")       ?: "") as String
    def username = (props.get("BackendUser")      ?: "") as String
    def password = (props.get("BackendPassword")  ?: "") as String

    if (!url) throw new Exception("Exchange property 'LookupUrl' is required")

    def basicAuth = (username + ":" + password).bytes.encodeBase64().toString()

    def conn = new URL(url).openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.setRequestProperty("Accept",        "application/json")
    conn.setRequestProperty("Authorization", "Basic " + basicAuth)
    conn.connectTimeout = 10_000
    conn.readTimeout    = 30_000
    conn.connect()

    def status = conn.responseCode
    message.setProperty("LookupHttpStatus", status.toString())

    if (status >= 200 && status < 300) {
        def responseText = conn.inputStream.getText("UTF-8")
        def json = new JsonSlurper().parseText(responseText)
        // Promote a single field to a property for use in downstream steps
        message.setProperty("LookupResult", json?.value?.toString() ?: "")
        message.setBody(responseText)
    } else {
        def errBody = conn.errorStream?.getText("UTF-8") ?: "(empty error body)"
        message.setProperty("LookupError", errBody)
        throw new Exception("Lookup call failed — HTTP " + status + ": " + errBody)
    }

    return message
}`,
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    id: 'base64-encode-decode',
    title: 'Base64 Encode / Decode',
    description:
      'Encodes the message body to Base64 or decodes it back to raw bytes. ' +
      'Direction is controlled by the exchange property "Base64Direction" (encode or decode). ' +
      'Useful for embedding binary content such as PDFs inside XML or JSON payloads.',
    complexity: 'Beginner',
    tags: ['Encoding', 'Conversion'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def direction = (message.getProperties().get("Base64Direction") ?: "encode")
                        .toString().toLowerCase().trim()
    def body      = message.getBody(String) as String

    switch (direction) {
        case "encode":
            message.setBody(body.bytes.encodeBase64().toString())
            break

        case "decode":
            try {
                def decoded = body.trim().decodeBase64()
                // Use ByteArrayInputStream so CPI treats it as binary (PDF, ZIP, etc.)
                message.setBody(new ByteArrayInputStream(decoded))
            } catch (Exception e) {
                throw new Exception("Base64 decode failed — payload may not be valid Base64: " + e.message)
            }
            break

        default:
            throw new Exception(
                "Unknown value for property 'Base64Direction': '" + direction +
                "'. Expected 'encode' or 'decode'."
            )
    }

    return message
}`,
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    id: 'xml-modify-xmlslurper',
    title: 'XML Read, Modify and Re-serialise',
    description:
      'The workhorse XML manipulation pattern in CPI. Parses an XML payload with XmlSlurper, ' +
      'reads node values into exchange properties for routing, modifies existing nodes, ' +
      'appends new child elements, and serialises the result back with XmlUtil.serialize().',
    complexity: 'Intermediate',
    tags: ['XML'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlUtil

def Message processData(Message message) {
    def doc = new XmlSlurper().parseText(message.getBody(String) as String)

    // ── Promote values to exchange properties (for Router / logging) ────────
    message.setProperty("OrderID",      doc.Header.OrderID.text())
    message.setProperty("DocumentType", doc.Header.DocumentType.text())
    message.setProperty("SupplierName", doc.Supplier.Name.text())

    // ── Modify an existing element ──────────────────────────────────────────
    doc.Header.Status = "PROCESSING"

    // ── Append new child elements ───────────────────────────────────────────
    doc.Header.appendNode {
        ProcessedAt(
            new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone("UTC"))
        )
        ProcessedBy("CPI-IFLOW")
    }

    // ── Remove a node (uncomment and adjust selector as needed) ────────────
    // doc.depthFirst().findAll { it.name() == "SensitiveField" }*.replaceNode {}

    // XmlUtil.serialize preserves the XML declaration and encoding
    message.setBody(XmlUtil.serialize(doc))
    return message
}`,
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    id: 'xml-build-markupbuilder',
    title: 'Build XML from Scratch with MarkupBuilder',
    description:
      'Constructs a well-formed XML document from exchange properties and header values ' +
      'using Groovy MarkupBuilder. Used when the output structure has no direct field ' +
      'mapping from the source — for example, building an FI document from SAP BAPI data.',
    complexity: 'Intermediate',
    tags: ['XML'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def props   = message.getProperties()
    def headers = message.getHeaders()

    def companyCode  = props.get("CompanyCode")   ?: "1000"
    def documentType = props.get("DocumentType")  ?: "KR"
    def glAccount    = props.get("GLAccount")     ?: "0000400000"
    def amount       = props.get("Amount")        ?: "0.00"
    def currency     = props.get("Currency")      ?: "EUR"
    def postingDate  = new Date().format("yyyyMMdd")
    def correlationId = headers.get("SAP_MessageProcessingLogID") ?: UUID.randomUUID().toString()

    def writer = new StringWriter()
    def xml    = new MarkupBuilder(writer)
    xml.mkp.xmlDeclaration(version: "1.0", encoding: "UTF-8")

    xml.FIDocument(xmlns: "urn:sap.com:fi:document:v1") {
        Header {
            CompanyCode(companyCode)
            DocumentType(documentType)
            PostingDate(postingDate)
            CorrelationID(correlationId)
            CreatedAt(
                new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone("UTC"))
            )
        }
        LineItems {
            Item(lineNumber: "001") {
                GLAccount(glAccount)
                Amount(currency: currency, amount)
                CostCentre(props.get("CostCentre") ?: "CC-1000")
                TaxCode(props.get("TaxCode")       ?: "V1")
            }
        }
    }

    message.setBody(writer.toString())
    return message
}`,
  },

  // ── 8 ─────────────────────────────────────────────────────────────────────
  {
    id: 'json-to-json-transform',
    title: 'JSON to JSON Transformation',
    description:
      'Reads a nested JSON payload, filters and aggregates data using Groovy closures, ' +
      'and builds a new JSON structure. Avoids the JSON → XML → JSON roundtrip ' +
      'common in XSLT-only mapping approaches. Uses Reader for memory efficiency.',
    complexity: 'Intermediate',
    tags: ['JSON'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

def Message processData(Message message) {
    // Using Reader is more memory-efficient than getBody(String) for large payloads
    def input = new JsonSlurper().parse(message.getBody(java.io.Reader))

    def header = input.Order?.Header
    def lines  = input.Order?.Items?.Item ?: []

    def output = [
        purchaseOrder: [
            id:         header?.OrderID,
            date:       header?.OrderDate,
            currency:   header?.Currency ?: "EUR",
            buyer:      header?.BuyerName,
            lineCount:  lines.size(),
            netAmount:  lines.sum { (it.UnitPrice as Double) * (it.Quantity as Integer) } ?: 0.0,
            lines:      lines.collect { line -> [
                lineNumber:     line.LineNumber as Integer,
                materialNumber: line.MaterialNumber,
                description:    line.Description,
                quantity:       line.Quantity as Integer,
                unit:           line.Unit ?: "EA",
                unitPrice:      line.UnitPrice as Double,
                lineTotal:      (line.UnitPrice as Double) * (line.Quantity as Integer),
            ]}
        ]
    ]

    message.setBody(JsonOutput.prettyPrint(JsonOutput.toJson(output)))
    return message
}`,
  },

  // ── 9 ─────────────────────────────────────────────────────────────────────
  {
    id: 'fix-json-types',
    title: 'Fix JSON Data Types After SAP Conversion',
    description:
      "SAP's standard XML→JSON converter produces every value as a string, including " +
      'integers, decimals, and booleans. This script coerces specific fields to their ' +
      'correct types so downstream JSON consumers receive a well-typed payload.',
    complexity: 'Intermediate',
    tags: ['JSON', 'Conversion'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

def Message processData(Message message) {
    def json = new JsonSlurper().parseText(message.getBody(String) as String)

    // ── Top-level field type fixes ─────────────────────────────────────────
    json.IsActive    = Boolean.parseBoolean(json.IsActive?.toString()  ?: "false")
    json.IsBlocked   = Boolean.parseBoolean(json.IsBlocked?.toString() ?: "false")
    json.TotalItems  = json.TotalItems?.toString()?.isInteger()  ? json.TotalItems.toInteger()  : 0
    json.NetAmount   = json.NetAmount?.toString()?.isDouble()    ? json.NetAmount.toDouble()    : 0.0

    // ── Per-line fixes ────────────────────────────────────────────────────
    json.Items?.each { item ->
        item.LineNumber = item.LineNumber?.toString()?.isInteger() ? item.LineNumber.toInteger() : 0
        item.Quantity   = item.Quantity?.toString()?.isInteger()   ? item.Quantity.toInteger()   : 0
        item.UnitPrice  = item.UnitPrice?.toString()?.isDouble()   ? item.UnitPrice.toDouble()   : 0.0
        item.Taxable    = Boolean.parseBoolean(item.Taxable?.toString() ?: "false")

        // SAP often sends empty strings instead of null — clean them up
        item.keySet().removeAll { key -> item[key]?.toString() == "" }
    }

    message.setBody(JsonOutput.toJson(json))
    return message
}`,
  },

  // ── 10 ────────────────────────────────────────────────────────────────────
  {
    id: 'dynamic-routing-value-mapping',
    title: 'Dynamic Receiver Routing via Value Mapping',
    description:
      'Resolves the target backend URL, user, and client from CPI Value Mapping tables ' +
      'based on an environment property (DEV / QAS / PRD). Enables a single iFlow to ' +
      'route to multiple landscapes without hard-coded endpoint configuration.',
    complexity: 'Advanced',
    tags: ['Routing', 'Security'],
    tenantOnly: true,
    body: `// ⚠  TENANT-ONLY SCRIPT
// Uses ITApiFactory / ValueMappingApi, which are only available inside a real
// CPI runtime. The API calls are commented out so this script loads in the IDE
// without errors, but Value Mapping lookups only work on a deployed tenant.

import com.sap.gateway.ip.core.customdev.util.Message
// import com.sap.it.api.ITApiFactory
// import com.sap.it.api.mapping.ValueMappingApi

def Message processData(Message message) {
    def env = (message.getProperties().get("TargetEnvironment") ?: "").toString().toUpperCase()

    if (!env) throw new Exception("Exchange property 'TargetEnvironment' is not set (DEV / QAS / PRD)")

    def keyPrefix
    switch (env) {
        case "DEV": keyPrefix = "S4H_010"; break
        case "QAS": keyPrefix = "S4H_020"; break
        case "PRD": keyPrefix = "S4H_030"; break
        default:    throw new Exception("Unknown environment '" + env + "'. Valid values: DEV, QAS, PRD")
    }

    // ── Uncomment when deployed on a CPI tenant ────────────────────────────
    // def vmApi  = ITApiFactory.getApi(ValueMappingApi.class, null)
    // def srcAgn = "ReceiverConfig"
    // def url    = vmApi.getMappedValue(srcAgn, "Parameter", keyPrefix + "_URL",    srcAgn, "Value")
    // def user   = vmApi.getMappedValue(srcAgn, "Parameter", keyPrefix + "_USER",   srcAgn, "Value")
    // def client = vmApi.getMappedValue(srcAgn, "Parameter", keyPrefix + "_CLIENT", srcAgn, "Value")
    // if (!url) throw new Exception("No Value Mapping found for key: " + keyPrefix + "_URL")
    // message.setProperty("ReceiverUrl",    url)
    // message.setProperty("ReceiverUser",   user)
    // message.setProperty("ReceiverClient", client)
    // ─────────────────────────────────────────────────────────────────────

    // Placeholder for IDE testing
    message.setProperty("ReceiverUrl",    "https://" + keyPrefix.toLowerCase() + ".example.com/sap/opu")
    message.setProperty("ReceiverUser",   "svc_cpi_" + env.toLowerCase())
    message.setProperty("ReceiverClient", env == "PRD" ? "200" : "100")
    message.setProperty("ResolvedEnv",    env)

    return message
}`,
  },

  // ── 11 ────────────────────────────────────────────────────────────────────
  {
    id: 'date-format-conversion',
    title: 'Date Format Conversion with Timezone Handling',
    description:
      "Converts an incoming SAP compact date string (yyyyMMdd) to multiple output formats " +
      "including ISO 8601, OData, European display, and SAP time. Always sets timezone " +
      "explicitly — CPI tenants run in UTC but the JVM default zone must not be assumed.",
    complexity: 'Beginner',
    tags: ['Date/Time', 'Conversion'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import java.text.SimpleDateFormat

def Message processData(Message message) {
    def props = message.getProperties()

    // Input — SAP compact date from a property (e.g. set by a preceding Script or Mapping)
    def inputStr  = (props.get("SAPDate") ?: new Date().format("yyyyMMdd")) as String
    def sourceTZ  = (props.get("SourceTimezone") ?: "UTC") as String
    def targetTZ  = (props.get("TargetTimezone") ?: "Europe/Berlin") as String

    def parseFmt = new SimpleDateFormat("yyyyMMdd")
    parseFmt.setTimeZone(TimeZone.getTimeZone(sourceTZ))
    def date = parseFmt.parse(inputStr)

    // Produce multiple formats as separate properties for downstream steps
    [
        Date_ISO8601:    ["yyyy-MM-dd'T'HH:mm:ss'Z'",  "UTC"],
        Date_ISO8601_TZ: ["yyyy-MM-dd'T'HH:mm:ssXXX",  targetTZ],
        Date_EU:         ["dd.MM.yyyy",                 targetTZ],
        Date_OData:      ["yyyy-MM-dd",                 "UTC"],
        Date_SAPCompact: ["yyyyMMdd",                   "UTC"],
        Date_Time:       ["HHmmss",                     "UTC"],
    ].each { propName, cfg ->
        def sdf = new SimpleDateFormat(cfg[0] as String)
        sdf.setTimeZone(TimeZone.getTimeZone(cfg[1] as String))
        message.setProperty(propName as String, sdf.format(date))
    }

    // Current processing timestamp
    def nowFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
    nowFmt.setTimeZone(TimeZone.getTimeZone("UTC"))
    message.setProperty("ProcessedAt", nowFmt.format(new Date()))

    return message
}`,
  },

  // ── 12 ────────────────────────────────────────────────────────────────────
  {
    id: 'exception-soap-fault',
    title: 'Exception Handler: Extract SOAP Fault',
    description:
      'Place in an Exception Subprocess after a SOAP receiver adapter call. ' +
      'Reads CamelExceptionCaught, extracts the fault code and detail XML from a ' +
      'CXF SoapFault, and falls back to a generic error XML for non-SOAP exceptions.',
    complexity: 'Intermediate',
    tags: ['Error Handling'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlUtil

def Message processData(Message message) {
    def ex = message.getProperties().get("CamelExceptionCaught")

    if (ex == null) {
        message.setProperty("ErrorType", "None")
        return message
    }

    def className = ex.getClass().getCanonicalName()
    message.setProperty("ExceptionClass", className)
    message.setProperty("ExceptionMessage", ex.getMessage() ?: "(no message)")

    if (className == "org.apache.cxf.binding.soap.SoapFault") {
        def detail = XmlUtil.serialize(ex.getOrCreateDetail())
        message.setBody(detail)
        message.setProperty("ErrorType",    "SOAPFault")
        message.setProperty("FaultCode",    ex.getFaultCode()?.toString() ?: "")
        message.setProperty("FaultMessage", ex.getMessage() ?: "")

        def mpl = messageLogFactory.getMessageLog(message)
        mpl?.addAttachmentAsString("SOAPFaultDetail", detail, "application/xml")
    } else {
        // Generic fallback — wrap in a simple error envelope
        def safe = { String s -> s?.replaceAll("&", "&amp;")?.replaceAll("<", "&lt;")?.replaceAll(">", "&gt;") ?: "" }
        def errXml = "<Error>" +
            "<Type>" + ex.getClass().getSimpleName() + "</Type>" +
            "<Message>" + safe(ex.getMessage()) + "</Message>" +
            "<Timestamp>" + new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone("UTC")) + "</Timestamp>" +
            "</Error>"
        message.setBody(errXml)
        message.setProperty("ErrorType", "GenericException")
    }

    return message
}`,
  },

  // ── 13 ────────────────────────────────────────────────────────────────────
  {
    id: 'exception-http-error',
    title: 'Exception Handler: Capture HTTP Error Response',
    description:
      'Place in an Exception Subprocess after an HTTP receiver adapter call. ' +
      'Extracts the HTTP status code, status text, and raw response body from ' +
      'CamelExceptionCaught and logs them to the MPL for diagnostics.',
    complexity: 'Intermediate',
    tags: ['Error Handling', 'HTTP'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def ex = message.getProperties().get("CamelExceptionCaught")
    if (ex == null) return message

    def className = ex.getClass().getCanonicalName()

    // CPI uses the Apache AHC (Async HTTP Client) component for HTTP receiver calls
    if (className == "org.apache.camel.component.ahc.AhcOperationFailedException") {
        def code     = ex.getStatusCode()
        def text     = ex.getStatusText() ?: ""
        def body     = ex.getResponseBody() ?: "(empty response body)"

        message.setProperty("HttpErrorCode", code.toString())
        message.setProperty("HttpErrorText", text)
        message.setProperty("HttpErrorBody", body)

        def mpl = messageLogFactory.getMessageLog(message)
        if (mpl != null) {
            mpl.setStringProperty("HttpStatus", code.toString() + " " + text)
            mpl.addAttachmentAsString("HttpErrorResponse", body, "text/plain")
        }

        // Make the error body the message payload so downstream error mapping can use it
        message.setBody(body)
        message.setHeader("http.ResponseCode", code.toString())

    } else {
        // Unexpected exception type — surface raw details
        message.setProperty("HttpErrorCode", "500")
        message.setProperty("HttpErrorBody", ex.getMessage() ?: className)
        message.setBody(
            "<Error><Class>" + ex.getClass().getSimpleName() + "</Class>" +
            "<Message>" + (ex.getMessage() ?: "") + "</Message></Error>"
        )
    }

    return message
}`,
  },

  // ── 14 ────────────────────────────────────────────────────────────────────
  {
    id: 'odata-pagination-builder',
    title: 'OData Pagination Query Builder',
    description:
      'Reads a total record count from an exchange property, divides it into pages, ' +
      'and builds an XML structure containing $top / $skip query strings. The output ' +
      'is then split by a General Splitter so each branch executes one OData call.',
    complexity: 'Advanced',
    tags: ['OData', 'Routing'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def props      = message.getProperties()
    def totalCount = (props.get("TotalRecordCount") ?: "0").toInteger()
    def pageSize   = (props.get("PageSize")         ?: "100").toInteger()
    def filterExpr = (props.get("ODataFilter")      ?: "") as String

    if (totalCount == 0) {
        message.setBody("<Pages/>")
        message.setProperty("TotalPages", "0")
        return message
    }

    int totalPages = Math.ceil(totalCount / pageSize).toInteger()

    def writer = new StringWriter()
    def xml    = new MarkupBuilder(writer)

    xml.Pages(total: totalPages, records: totalCount, pageSize: pageSize) {
        (0..<totalPages).each { pageIndex ->
            int skip = pageIndex * pageSize
            int top  = (pageIndex == totalPages - 1 && totalCount % pageSize != 0)
                           ? (totalCount % pageSize) : pageSize

            // Use single-quoted strings so Groovy does not GString-interpolate the $ sign
            def parts = ['$top=' + top, '$skip=' + skip]
            if (filterExpr) parts.add('$filter=' + filterExpr)

            Page(index: pageIndex + 1) {
                QueryString(parts.join("&"))
                Skip(skip)
                Top(top)
            }
        }
    }

    message.setBody(writer.toString())
    message.setProperty("TotalPages", totalPages.toString())
    return message
}`,
  },

  // ── 15 ────────────────────────────────────────────────────────────────────
  {
    id: 'xml-to-csv',
    title: 'XML to CSV Conversion',
    description:
      'Flattens a structured XML payload containing a list of items into a CSV string. ' +
      'Column headers are derived from the child element names of the first item. ' +
      'Values containing the separator or double-quotes are automatically quoted.',
    complexity: 'Intermediate',
    tags: ['XML', 'Conversion'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props = message.getProperties()
    def sep   = (props.get("CSVSeparator") ?: ",") as String
    def doc   = new XmlSlurper().parseText(message.getBody(String) as String)

    // Derive column names from the first item's child element names
    def firstItem = doc.Items.Item[0]
    def columns   = firstItem.children().collect { it.name() }

    // Quote a field value if it contains the separator, double-quotes, or newlines
    def quote = { String val ->
        if (val.contains(sep) || val.contains('"') || val.contains('\\n')) {
            '"' + val.replace('"', '""') + '"'
        } else {
            val
        }
    }

    def rows = doc.Items.Item.collect { item ->
        columns.collect { col -> quote(item[col].text()) }.join(sep)
    }

    def csv = ([columns.join(sep)] + rows).join('\\n')

    message.setBody(csv)
    message.setHeader("Content-Type",  "text/csv")
    message.setProperty("RowCount",    rows.size().toString())
    message.setProperty("ColumnCount", columns.size().toString())

    return message
}`,
  },

  // ── 16 ────────────────────────────────────────────────────────────────────
  {
    id: 'process-attachments',
    title: 'Filter and Promote Message Attachment',
    description:
      'Iterates all MIME attachments on the message (e.g. from an inbound email adapter or ' +
      'SOAP with attachments), finds the first one whose filename matches a pattern, and ' +
      'promotes its content to the main message body for further processing.',
    complexity: 'Intermediate',
    tags: ['Attachments'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import javax.activation.DataHandler

def Message processData(Message message) {
    def props   = message.getProperties()
    def pattern = (props.get("AttachmentNamePattern") ?: "invoice").toString().toLowerCase()

    def attachments = message.getAttachments() as Map<String, DataHandler>
    if (!attachments) throw new Exception("No attachments found on this message")

    def mpl = messageLogFactory.getMessageLog(message)
    // Log all attachment names for diagnostics
    attachments.each { name, dh -> mpl?.setStringProperty("Attachment_" + name, dh.getContentType()) }

    // Find the first attachment whose filename contains the pattern (case-insensitive)
    def match = attachments.find { name, _ -> name?.toLowerCase()?.contains(pattern) }

    if (!match) {
        def available = attachments.keySet().join(", ")
        throw new Exception(
            "No attachment matching '" + pattern + "' found. Available: [" + available + "]"
        )
    }

    def matchName = match.key
    def matchDH   = match.value as DataHandler

    message.setBody(matchDH.getContent())
    message.setHeader("AttachmentName",        matchName)
    message.setHeader("AttachmentContentType", matchDH.getContentType())
    message.setProperty("AttachmentMatched",   matchName)

    return message
}`,
  },

  // ── 17 ────────────────────────────────────────────────────────────────────
  {
    id: 'idoc-long-text-tdline',
    title: 'IDoc Long Text — 132-character TDLINE Segmentation',
    description:
      'Splits a long free-form text string into 132-character segments, each wrapped in ' +
      'an E1EDKT2/TDLINE element, respecting the hard character limit imposed by SAP IDoc ' +
      'text segments. Word boundaries are used to avoid cutting mid-word.',
    complexity: 'Advanced',
    tags: ['IDoc'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def doc      = new XmlSlurper().parseText(message.getBody(String) as String)
    def longText = doc.IDOC.E1EDKT1.TDLINE.text()?.trim() ?: ""
    int maxLen   = 132

    if (!longText) {
        message.setBody("<E1EDKT2Lines/>")
        message.setProperty("TDLineCount", "0")
        return message
    }

    // Chunk at word boundaries to avoid splitting mid-word
    def chunks    = []
    def remaining = longText

    while (remaining.length() > maxLen) {
        // Try to break at the last space within the limit; hard-cut if none found
        int splitAt = remaining.lastIndexOf(' ', maxLen)
        if (splitAt <= 0) splitAt = maxLen
        chunks << remaining.substring(0, splitAt).trim()
        remaining = remaining.substring(splitAt).trim()
    }
    if (remaining) chunks << remaining

    def writer  = new StringWriter()
    def builder = new MarkupBuilder(writer)

    builder.E1EDKT2Lines {
        chunks.each { chunk ->
            E1EDKT2 {
                TDFORMAT("  ")   // two spaces = normal text line in SAP
                TDLINE(chunk)
            }
        }
    }

    message.setBody(writer.toString())
    message.setProperty("TDLineCount",     chunks.size().toString())
    message.setProperty("OriginalLength",  longText.length().toString())

    return message
}`,
  },

  // ── 18 ────────────────────────────────────────────────────────────────────
  {
    id: 'set-routing-properties',
    title: 'Evaluate Conditions and Set Routing Properties',
    description:
      'Inspects the message body and headers to classify the document type, then sets ' +
      'typed exchange properties. A downstream Router step references these with ' +
      'Simple Expression Language: ${property.RoutingKey} == \'VENDOR_INVOICE\'.',
    complexity: 'Beginner',
    tags: ['Routing'],
    body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def body    = message.getBody(String) as String
    def headers = message.getHeaders()
    def props   = message.getProperties()

    // Sender system — typically set by the adapter (SOAP: SOAPAction header; HTTP: custom header)
    def senderSystem = headers.get("SenderSystemID")
                    ?: props.get("SAPSenderSystem")
                    ?: "UNKNOWN"

    // Classify document type by inspecting body content.
    // For large payloads swap this for XmlSlurper to avoid holding the full string.
    String routingKey
    if      (body.contains("<DocumentType>KR</DocumentType>")) routingKey = "VENDOR_INVOICE"
    else if (body.contains("<DocumentType>KG</DocumentType>")) routingKey = "VENDOR_CREDIT"
    else if (body.contains("<DocumentType>DR</DocumentType>")) routingKey = "CUSTOMER_INVOICE"
    else if (body.contains("<DocumentType>DG</DocumentType>")) routingKey = "CUSTOMER_CREDIT"
    else                                                        routingKey = "STANDARD"

    // Set exchange properties consumed by a Router step:
    //   Condition:  \${property.RoutingKey} == 'VENDOR_INVOICE'
    message.setProperty("RoutingKey",    routingKey)
    message.setProperty("SenderSystem",  senderSystem)
    message.setProperty("IsCredit",      routingKey.endsWith("CREDIT").toString())
    message.setProperty("ProcessingDate",
        new Date().format("yyyyMMdd"))
    message.setProperty("ProcessingTS",
        new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone("UTC")))

    return message
}`,
  },
]
