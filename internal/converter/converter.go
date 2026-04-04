// Package converter provides roundtrip-safe XML ↔ JSON conversion.
package converter

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strings"

	"github.com/achgithub/sap-cpi-toolkit/internal/formatter"
)

// Result holds the output of a conversion operation.
type Result struct {
	Output   string
	Warnings []string
}

// XMLToJSON converts an XML document to JSON preserving namespaces and attributes.
func XMLToJSON(content string) (Result, error) {
	dec := xml.NewDecoder(strings.NewReader(content))
	var warnings []string

	root, err := parseXMLNode(dec, &warnings)
	if err != nil {
		return Result{}, fmt.Errorf("XML parse: %w", err)
	}

	b, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return Result{}, err
	}
	return Result{Output: string(b), Warnings: warnings}, nil
}

// JSONToXML converts a JSON document back to XML.
// Accepts both our round-trip xmlNode format and arbitrary JSON.
func JSONToXML(content string) (Result, error) {
	var node xmlNode
	if err := json.Unmarshal([]byte(content), &node); err != nil || node.XMLName == "" {
		return genericJSONToXML(content)
	}

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	renderXMLNode(&sb, &node, 0)
	return Result{Output: sb.String()}, nil
}

// xmlNode is the intermediate representation used for round-trip-safe conversion.
type xmlNode struct {
	XMLName  string            `json:"_tag"`
	NS       string            `json:"_ns,omitempty"`
	NSPrefix string            `json:"_nsp,omitempty"`
	Attrs    []xmlAttr         `json:"_attrs,omitempty"`
	Text     string            `json:"_text,omitempty"`
	Children []*xmlNode        `json:"_children,omitempty"`
	NSMap    map[string]string `json:"_nsmap,omitempty"`
}

type xmlAttr struct {
	Name  string `json:"name"`
	NS    string `json:"ns,omitempty"`
	Value string `json:"value"`
}

func parseXMLNode(dec *xml.Decoder, warnings *[]string) (*xmlNode, error) {
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil, fmt.Errorf("empty document")
		}
		if err != nil {
			return nil, err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return buildNode(dec, se, warnings)
		}
	}
}

func buildNode(dec *xml.Decoder, se xml.StartElement, warnings *[]string) (*xmlNode, error) {
	node := &xmlNode{XMLName: se.Name.Local, NS: se.Name.Space}

	nsMap := make(map[string]string)
	for _, a := range se.Attr {
		if a.Name.Space == "xmlns" {
			nsMap[a.Name.Local] = a.Value
		} else if a.Name.Local == "xmlns" {
			nsMap[""] = a.Value
		} else {
			node.Attrs = append(node.Attrs, xmlAttr{Name: a.Name.Local, NS: a.Name.Space, Value: a.Value})
		}
	}
	if len(nsMap) > 0 {
		node.NSMap = nsMap
		for prefix, uri := range nsMap {
			if uri == se.Name.Space {
				node.NSPrefix = prefix
				break
			}
		}
	}

	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			child, err := buildNode(dec, t, warnings)
			if err != nil {
				return nil, err
			}
			node.Children = append(node.Children, child)
		case xml.EndElement:
			return node, nil
		case xml.CharData:
			if trimmed := strings.TrimSpace(string(t)); trimmed != "" {
				if len(node.Children) > 0 {
					*warnings = append(*warnings, fmt.Sprintf("mixed content on <%s>: text alongside child elements — ordering may change", se.Name.Local))
				}
				node.Text += trimmed
			}
		case xml.Comment:
			*warnings = append(*warnings, fmt.Sprintf("XML comment dropped: %s", strings.TrimSpace(string(t))))
		}
	}
}

func renderXMLNode(sb *strings.Builder, node *xmlNode, depth int) {
	indent := strings.Repeat("  ", depth)
	tag := node.XMLName

	sb.WriteString(indent + "<" + tag)
	for prefix, uri := range node.NSMap {
		if prefix == "" {
			sb.WriteString(fmt.Sprintf(` xmlns="%s"`, uri))
		} else {
			sb.WriteString(fmt.Sprintf(` xmlns:%s="%s"`, prefix, uri))
		}
	}
	for _, a := range node.Attrs {
		name := a.Name
		if a.NS != "" {
			name = a.NS + ":" + a.Name
		}
		sb.WriteString(fmt.Sprintf(` %s="%s"`, name, formatter.EscapeAttr(a.Value)))
	}

	if node.Text == "" && len(node.Children) == 0 {
		sb.WriteString("/>\n")
		return
	}
	sb.WriteString(">")
	if len(node.Children) > 0 {
		sb.WriteString("\n")
		for _, c := range node.Children {
			renderXMLNode(sb, c, depth+1)
		}
		sb.WriteString(indent + "</" + tag + ">\n")
	} else {
		sb.WriteString(formatter.EscapeText(node.Text) + "</" + tag + ">\n")
	}
}

func genericJSONToXML(content string) (Result, error) {
	var data interface{}
	if err := json.Unmarshal([]byte(content), &data); err != nil {
		return Result{}, fmt.Errorf("JSON parse: %w", err)
	}
	warnings := []string{"Input is generic JSON (not round-trip format) — namespace and attribute information cannot be restored"}
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	renderGenericNode(&sb, "root", data, 0)
	return Result{Output: sb.String(), Warnings: warnings}, nil
}

func renderGenericNode(sb *strings.Builder, tag string, val interface{}, depth int) {
	indent := strings.Repeat("  ", depth)
	tag = sanitiseXMLTag(tag)
	switch v := val.(type) {
	case map[string]interface{}:
		sb.WriteString(indent + "<" + tag + ">\n")
		for k, child := range v {
			renderGenericNode(sb, k, child, depth+1)
		}
		sb.WriteString(indent + "</" + tag + ">\n")
	case []interface{}:
		for _, item := range v {
			renderGenericNode(sb, tag, item, depth)
		}
	case nil:
		sb.WriteString(indent + "<" + tag + "/>\n")
	default:
		sb.WriteString(fmt.Sprintf("%s<%s>%s</%s>\n", indent, tag, formatter.EscapeText(fmt.Sprintf("%v", v)), tag))
	}
}

func sanitiseXMLTag(s string) string {
	if s == "" {
		return "element"
	}
	if s[0] >= '0' && s[0] <= '9' {
		s = "n" + s
	}
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}
