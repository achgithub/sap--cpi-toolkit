package testdata

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
)

// ── XSD struct types ──────────────────────────────────────────────────────────

type xsdSchema struct {
	XMLName      xml.Name         `xml:"http://www.w3.org/2001/XMLSchema schema"`
	Elements     []xsdElement     `xml:"http://www.w3.org/2001/XMLSchema element"`
	ComplexTypes []xsdComplexType `xml:"http://www.w3.org/2001/XMLSchema complexType"`
}

type xsdElement struct {
	Name        string          `xml:"name,attr"`
	Type        string          `xml:"type,attr"`
	MinOccurs   string          `xml:"minOccurs,attr"`
	MaxOccurs   string          `xml:"maxOccurs,attr"`
	ComplexType *xsdComplexType `xml:"http://www.w3.org/2001/XMLSchema complexType"`
	SimpleType  *xsdSimpleType  `xml:"http://www.w3.org/2001/XMLSchema simpleType"`
}

type xsdComplexType struct {
	Name     string      `xml:"name,attr"`
	Sequence xsdParticle `xml:"http://www.w3.org/2001/XMLSchema sequence"`
	All      xsdParticle `xml:"http://www.w3.org/2001/XMLSchema all"`
	Choice   xsdParticle `xml:"http://www.w3.org/2001/XMLSchema choice"`
}

type xsdParticle struct {
	Elements []xsdElement `xml:"http://www.w3.org/2001/XMLSchema element"`
}

type xsdSimpleType struct {
	Restriction xsdRestriction `xml:"http://www.w3.org/2001/XMLSchema restriction"`
}

type xsdRestriction struct {
	Base string `xml:"base,attr"`
}

// ── Synth tree ────────────────────────────────────────────────────────────────

// xsdSynthNode is an internal tree used to build the synthesized XML template.
// Each node tracks how many times it should repeat in the output.
type xsdSynthNode struct {
	name      string
	children  []*xsdSynthNode
	childMap  map[string]*xsdSynthNode
	isLeaf    bool
	leafVal   string
	instances int // repeat count in synthesized XML (≥1)
}

// ── Public API ────────────────────────────────────────────────────────────────

// AnalyseXSD parses an XSD schema and returns the same AnalyseResult as
// Analyse (XML mode). The SynthesizedTemplate field contains a minimal sample
// XML built from the schema: repeating elements (maxOccurs > 1 or unbounded)
// are expanded to min(maxOccurs, 3) instances so the template is realistic.
func AnalyseXSD(content string) (AnalyseResult, error) {
	var schema xsdSchema
	if err := xml.Unmarshal([]byte(content), &schema); err != nil {
		return AnalyseResult{}, fmt.Errorf("invalid XSD: %w", err)
	}
	if len(schema.Elements) == 0 {
		return AnalyseResult{}, fmt.Errorf("no top-level xs:element found in schema")
	}

	// Index named complex types for $ref resolution
	namedTypes := make(map[string]*xsdComplexType, len(schema.ComplexTypes))
	for i := range schema.ComplexTypes {
		ct := &schema.ComplexTypes[i]
		if ct.Name != "" {
			namedTypes[ct.Name] = ct
		}
	}

	var fields []Field
	var repeatPoints []string
	seenPaths := make(map[string]bool)

	synthRoot := &xsdSynthNode{
		childMap:  make(map[string]*xsdSynthNode),
		instances: 1,
	}

	for i := range schema.Elements {
		walkXSDElement("", &schema.Elements[i], &fields, &repeatPoints, namedTypes, seenPaths, synthRoot)
	}

	return AnalyseResult{
		Fields:              fields,
		RepeatPoints:        repeatPoints,
		SynthesizedTemplate: synthesizeXMLFromTree(synthRoot),
	}, nil
}

// ── XSD traversal ─────────────────────────────────────────────────────────────

func xsdLocalName(t string) string {
	if idx := strings.IndexByte(t, ':'); idx >= 0 {
		return t[idx+1:]
	}
	return t
}

func xsdMapType(xsType string) string {
	switch xsdLocalName(xsType) {
	case "integer", "int", "long", "short", "byte",
		"positiveInteger", "nonNegativeInteger", "negativeInteger",
		"nonPositiveInteger", "unsignedInt", "unsignedLong", "unsignedShort", "unsignedByte":
		return TypeInteger
	case "decimal", "float", "double":
		return TypeDecimal
	case "date":
		return TypeDate
	case "dateTime":
		return TypeDatetime
	case "boolean":
		return TypeBoolean
	default:
		return TypeString
	}
}

func xsdSampleValue(detectedType string) string {
	switch detectedType {
	case TypeInteger:
		return "1"
	case TypeDecimal:
		return "1.00"
	case TypeDate:
		return "2024-01-15"
	case TypeDatetime:
		return "2024-01-15T00:00:00Z"
	case TypeBoolean:
		return "true"
	default:
		return "SAMPLE"
	}
}

// xsdRepeatCount returns how many instances to write in the synthesized XML.
// Rule: min(maxOccurs, 3), but use exact value when maxOccurs ≤ 3.
// unbounded → 3 instances.
func xsdRepeatCount(maxOccurs string) int {
	if maxOccurs == "" || maxOccurs == "1" || maxOccurs == "0" {
		return 1
	}
	if maxOccurs == "unbounded" {
		return 3
	}
	n, err := strconv.Atoi(maxOccurs)
	if err != nil || n <= 1 {
		return 1
	}
	if n > 3 {
		return 3
	}
	return n // e.g. maxOccurs="2" → 2 instances
}

func getSynthChild(parent *xsdSynthNode, name string, instances int) *xsdSynthNode {
	if child, ok := parent.childMap[name]; ok {
		return child
	}
	child := &xsdSynthNode{
		name:      name,
		childMap:  make(map[string]*xsdSynthNode),
		instances: instances,
	}
	parent.children = append(parent.children, child)
	parent.childMap[name] = child
	return child
}

func walkXSDElement(
	parentPath string,
	elem *xsdElement,
	fields *[]Field,
	repeatPoints *[]string,
	namedTypes map[string]*xsdComplexType,
	seenPaths map[string]bool,
	synthParent *xsdSynthNode,
) {
	if elem.Name == "" {
		return
	}
	path := elem.Name
	if parentPath != "" {
		path = parentPath + "." + elem.Name
	}

	instances := xsdRepeatCount(elem.MaxOccurs)
	if instances > 1 && !seenPaths["rpt:"+path] {
		*repeatPoints = append(*repeatPoints, path)
		seenPaths["rpt:"+path] = true
	}

	synthNode := getSynthChild(synthParent, elem.Name, instances)

	// Explicit simple type attribute (xs:string, xs:integer, etc.)
	if elem.Type != "" && elem.ComplexType == nil && elem.SimpleType == nil {
		localType := xsdLocalName(elem.Type)
		if ct, ok := namedTypes[localType]; ok {
			// Named complex type reference
			walkXSDComplexType(path, ct, fields, repeatPoints, namedTypes, seenPaths, synthNode)
			return
		}
		// Simple leaf
		if !seenPaths[path] {
			dt := xsdMapType(elem.Type)
			*fields = append(*fields, Field{Path: path, SampleValue: xsdSampleValue(dt), DetectedType: dt})
			seenPaths[path] = true
			synthNode.isLeaf = true
			synthNode.leafVal = xsdSampleValue(dt)
		}
		return
	}

	// Inline simpleType with restriction base
	if elem.SimpleType != nil && elem.ComplexType == nil {
		if !seenPaths[path] {
			dt := xsdMapType(elem.SimpleType.Restriction.Base)
			*fields = append(*fields, Field{Path: path, SampleValue: xsdSampleValue(dt), DetectedType: dt})
			seenPaths[path] = true
			synthNode.isLeaf = true
			synthNode.leafVal = xsdSampleValue(dt)
		}
		return
	}

	// Inline complexType
	if elem.ComplexType != nil {
		walkXSDComplexType(path, elem.ComplexType, fields, repeatPoints, namedTypes, seenPaths, synthNode)
		return
	}

	// No type info — omitted or unknown — treat as string leaf
	if !seenPaths[path] {
		*fields = append(*fields, Field{Path: path, SampleValue: "", DetectedType: TypeString})
		seenPaths[path] = true
		synthNode.isLeaf = true
		synthNode.leafVal = "SAMPLE"
	}
}

func walkXSDComplexType(
	parentPath string,
	ct *xsdComplexType,
	fields *[]Field,
	repeatPoints *[]string,
	namedTypes map[string]*xsdComplexType,
	seenPaths map[string]bool,
	synthParent *xsdSynthNode,
) {
	for i := range ct.Sequence.Elements {
		walkXSDElement(parentPath, &ct.Sequence.Elements[i], fields, repeatPoints, namedTypes, seenPaths, synthParent)
	}
	for i := range ct.All.Elements {
		walkXSDElement(parentPath, &ct.All.Elements[i], fields, repeatPoints, namedTypes, seenPaths, synthParent)
	}
	for i := range ct.Choice.Elements {
		walkXSDElement(parentPath, &ct.Choice.Elements[i], fields, repeatPoints, namedTypes, seenPaths, synthParent)
	}
}

// ── XML synthesis ─────────────────────────────────────────────────────────────

func synthesizeXMLFromTree(root *xsdSynthNode) string {
	if len(root.children) == 0 {
		return ""
	}
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	for _, child := range root.children {
		writeSynthNode(&buf, child, 0)
	}
	buf.WriteByte('\n')
	return buf.String()
}

func writeSynthNode(buf *bytes.Buffer, n *xsdSynthNode, depth int) {
	indent := strings.Repeat("  ", depth)
	for i := 0; i < n.instances; i++ {
		if n.isLeaf {
			buf.WriteString("\n" + indent + "<" + n.name + ">" + xsdEscapeXML(n.leafVal) + "</" + n.name + ">")
		} else {
			buf.WriteString("\n" + indent + "<" + n.name + ">")
			for _, child := range n.children {
				writeSynthNode(buf, child, depth+1)
			}
			buf.WriteString("\n" + indent + "</" + n.name + ">")
		}
	}
}

func xsdEscapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
