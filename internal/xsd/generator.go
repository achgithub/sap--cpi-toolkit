// Package xsd generates an XSD schema from a sample XML document.
package xsd

import (
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

// Result holds the generated XSD and any informational warnings.
type Result struct {
	XSD      string
	Warnings []string
}

// FromXML analyses a sample XML document and generates an XSD schema.
// Types are inferred from content values. Cardinality is inferred from
// element repetition within the sample — the UI warns that optionality
// should be reviewed since only one sample is used.
func FromXML(content string) (Result, error) {
	dec := xml.NewDecoder(strings.NewReader(content))
	root, err := parseNode(dec)
	if err != nil {
		return Result{}, fmt.Errorf("XML parse: %w", err)
	}

	warnings := []string{
		"Schema inferred from a single sample — review minOccurs on all elements (all shown as required).",
		"Cardinality (maxOccurs) is set to unbounded only where the same element name repeats at the same level.",
	}

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">` + "\n")

	// Count root-level occurrences (root is always 1)
	rootCounts := map[string]int{root.name: 1}
	renderElement(&sb, root, rootCounts, 1)

	sb.WriteString(`</xs:schema>` + "\n")
	return Result{XSD: sb.String(), Warnings: warnings}, nil
}

// node is a lightweight XML tree used for XSD inference.
type node struct {
	name     string
	attrs    []xmlAttr
	text     string
	children []*node
}

type xmlAttr struct {
	name  string
	value string
}

func parseNode(dec *xml.Decoder) (*node, error) {
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil, fmt.Errorf("empty document")
		}
		if err != nil {
			return nil, err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return buildNode(dec, se)
		}
	}
}

func buildNode(dec *xml.Decoder, se xml.StartElement) (*node, error) {
	n := &node{name: se.Name.Local}
	for _, a := range se.Attr {
		// Skip namespace declarations
		if a.Name.Space == "xmlns" || a.Name.Local == "xmlns" {
			continue
		}
		n.attrs = append(n.attrs, xmlAttr{name: a.Name.Local, value: a.Value})
	}
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			child, err := buildNode(dec, t)
			if err != nil {
				return nil, err
			}
			n.children = append(n.children, child)
		case xml.EndElement:
			return n, nil
		case xml.CharData:
			if trimmed := strings.TrimSpace(string(t)); trimmed != "" {
				n.text += trimmed
			}
		}
	}
}

// renderElement writes an xs:element (and its xs:complexType if needed) to sb.
// parentCounts is the frequency map of sibling element names from the parent.
func renderElement(sb *strings.Builder, n *node, parentCounts map[string]int, depth int) {
	indent := strings.Repeat("  ", depth)
	hasChildren := len(n.children) > 0
	hasAttrs := len(n.attrs) > 0

	maxOccurs := "1"
	if parentCounts[n.name] > 1 {
		maxOccurs = "unbounded"
	}

	occurrenceAttrs := ""
	if maxOccurs != "1" {
		occurrenceAttrs = fmt.Sprintf(` minOccurs="1" maxOccurs="%s"`, maxOccurs)
	}

	if !hasChildren && !hasAttrs {
		// Simple element
		xsType := inferType(n.text)
		sb.WriteString(fmt.Sprintf(`%s<xs:element name="%s" type="%s"%s/>%s`,
			indent, n.name, xsType, occurrenceAttrs, "\n"))
		return
	}

	// Complex element
	sb.WriteString(fmt.Sprintf(`%s<xs:element name="%s"%s>%s`, indent, n.name, occurrenceAttrs, "\n"))
	sb.WriteString(fmt.Sprintf(`%s  <xs:complexType>%s`, indent, "\n"))

	if hasChildren {
		// Build child frequency map for occurrence inference
		childCounts := make(map[string]int)
		for _, c := range n.children {
			childCounts[c.name]++
		}

		sb.WriteString(fmt.Sprintf(`%s    <xs:sequence>%s`, indent, "\n"))
		// Render each unique child in document order (first occurrence only)
		seen := make(map[string]bool)
		for _, c := range n.children {
			if !seen[c.name] {
				seen[c.name] = true
				renderElement(sb, c, childCounts, depth+3)
			}
		}
		sb.WriteString(fmt.Sprintf(`%s    </xs:sequence>%s`, indent, "\n"))
	} else if n.text != "" {
		// Complex type with simple content (has attributes + text)
		sb.WriteString(fmt.Sprintf(`%s    <xs:simpleContent>%s`, indent, "\n"))
		sb.WriteString(fmt.Sprintf(`%s      <xs:extension base="%s">%s`, indent, inferType(n.text), "\n"))
		for _, a := range n.attrs {
			sb.WriteString(fmt.Sprintf(`%s        <xs:attribute name="%s" type="%s" use="required"/>%s`,
				indent, a.name, inferType(a.value), "\n"))
		}
		sb.WriteString(fmt.Sprintf(`%s      </xs:extension>%s`, indent, "\n"))
		sb.WriteString(fmt.Sprintf(`%s    </xs:simpleContent>%s`, indent, "\n"))
		sb.WriteString(fmt.Sprintf(`%s  </xs:complexType>%s`, indent, "\n"))
		sb.WriteString(fmt.Sprintf(`%s</xs:element>%s`, indent, "\n"))
		return
	}

	// Attributes on a complex type with child elements
	if hasChildren {
		for _, a := range n.attrs {
			sb.WriteString(fmt.Sprintf(`%s    <xs:attribute name="%s" type="%s" use="required"/>%s`,
				indent, a.name, inferType(a.value), "\n"))
		}
	}

	sb.WriteString(fmt.Sprintf(`%s  </xs:complexType>%s`, indent, "\n"))
	sb.WriteString(fmt.Sprintf(`%s</xs:element>%s`, indent, "\n"))
}

var (
	reDate     = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reDateTime = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}`)
)

// inferType returns the most specific xs:* type for the given string value.
func inferType(value string) string {
	if value == "" {
		return "xs:string"
	}
	lower := strings.ToLower(strings.TrimSpace(value))
	if lower == "true" || lower == "false" {
		return "xs:boolean"
	}
	if _, err := strconv.ParseInt(value, 10, 64); err == nil {
		return "xs:integer"
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return "xs:decimal"
	}
	if reDateTime.MatchString(value) {
		return "xs:dateTime"
	}
	if reDate.MatchString(value) {
		return "xs:date"
	}
	return "xs:string"
}
