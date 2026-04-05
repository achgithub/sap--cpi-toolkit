// Package testdata provides the XML test data generation engine.
// It parses a sample XML, identifies leaf fields with auto-detected types,
// and generates N varied XML documents returned as a ZIP archive.
package testdata

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"math/rand"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Field types
const (
	TypeString   = "string"
	TypeInteger  = "integer"
	TypeDecimal  = "decimal"
	TypeDate     = "date"
	TypeDatetime = "datetime"
	TypeBoolean  = "boolean"
)

// Generation modes
const (
	ModeRandom = "random"
	ModeFixed  = "fixed"
)

// --- Public types ---

// Field is a leaf XML element identified during analysis.
type Field struct {
	Path         string `json:"path"`
	SampleValue  string `json:"sample_value"`
	DetectedType string `json:"detected_type"`
}

// AnalyseResult is returned by Analyse.
type AnalyseResult struct {
	Fields []Field `json:"fields"`
}

// FieldConfig describes how to generate values for one field.
type FieldConfig struct {
	Path          string  `json:"path"`
	Type          string  `json:"type"`
	Mode          string  `json:"mode"` // "random" | "fixed"
	Value         string  `json:"value,omitempty"`          // fixed mode
	Min           float64 `json:"min,omitempty"`            // integer / decimal random
	Max           float64 `json:"max,omitempty"`
	DecimalPlaces int     `json:"decimal_places,omitempty"` // decimal random
	DateStart     string  `json:"date_start,omitempty"`     // date / datetime random
	DateEnd       string  `json:"date_end,omitempty"`
	Prefix        string  `json:"prefix,omitempty"` // string random
	Length        int     `json:"length,omitempty"`
}

// GenerateRequest is the payload for Generate.
type GenerateRequest struct {
	Template string        `json:"template"`
	Count    int           `json:"count"`
	Fields   []FieldConfig `json:"fields"`
}

// --- XML node ---

type xmlNode struct {
	Name     string
	NS       string
	Attrs    []xml.Attr
	NSDecls  []xml.Attr
	Text     string
	Children []*xmlNode
}

// --- Public API ---

// Analyse parses the XML and returns every unique leaf-node path with its
// sample value and auto-detected type. Repeated elements share one path entry.
func Analyse(content string) (AnalyseResult, error) {
	root, err := parseXML(content)
	if err != nil {
		return AnalyseResult{}, err
	}
	var fields []Field
	seen := make(map[string]bool)
	collectLeaves(root, root.Name, seen, &fields)
	return AnalyseResult{Fields: fields}, nil
}

// Generate produces Count XML documents with field values varied according to
// the supplied FieldConfigs, and returns the documents as a ZIP archive.
// Count is capped at 1000.
func Generate(req GenerateRequest) ([]byte, error) {
	if req.Count <= 0 {
		req.Count = 1
	}
	if req.Count > 1000 {
		req.Count = 1000
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano())) //nolint:gosec

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for i := 1; i <= req.Count; i++ {
		root, err := parseXML(req.Template)
		if err != nil {
			return nil, fmt.Errorf("parse template: %w", err)
		}
		for _, fc := range req.Fields {
			segs := strings.Split(fc.Path, ".")
			// segs[0] is the root element name
			if len(segs) > 1 && segs[0] == root.Name {
				val := generateValue(fc, rng)
				applyValue(root, segs[1:], val)
			}
		}
		xmlContent := `<?xml version="1.0" encoding="UTF-8"?>` + "\n" + renderNode(root, 0)
		fw, err := zw.Create(fmt.Sprintf("record_%04d.xml", i))
		if err != nil {
			return nil, fmt.Errorf("zip create: %w", err)
		}
		if _, err := fw.Write([]byte(xmlContent)); err != nil {
			return nil, fmt.Errorf("zip write: %w", err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("zip close: %w", err)
	}
	return buf.Bytes(), nil
}

// --- XML parsing ---

func parseXML(content string) (*xmlNode, error) {
	dec := xml.NewDecoder(strings.NewReader(content))
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil, fmt.Errorf("empty XML document")
		}
		if err != nil {
			return nil, fmt.Errorf("XML parse: %w", err)
		}
		if se, ok := tok.(xml.StartElement); ok {
			return buildNode(dec, se)
		}
	}
}

func buildNode(dec *xml.Decoder, se xml.StartElement) (*xmlNode, error) {
	node := &xmlNode{Name: se.Name.Local, NS: se.Name.Space}
	for _, a := range se.Attr {
		if a.Name.Space == "xmlns" || (a.Name.Space == "" && a.Name.Local == "xmlns") {
			node.NSDecls = append(node.NSDecls, a)
		} else {
			node.Attrs = append(node.Attrs, a)
		}
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
			node.Children = append(node.Children, child)
		case xml.EndElement:
			return node, nil
		case xml.CharData:
			if s := strings.TrimSpace(string(t)); s != "" {
				node.Text = s
			}
		}
	}
}

// --- Field analysis ---

func collectLeaves(node *xmlNode, path string, seen map[string]bool, out *[]Field) {
	if len(node.Children) == 0 {
		if !seen[path] {
			seen[path] = true
			*out = append(*out, Field{
				Path:         path,
				SampleValue:  node.Text,
				DetectedType: detectType(node.Text),
			})
		}
		return
	}
	for _, child := range node.Children {
		collectLeaves(child, path+"."+child.Name, seen, out)
	}
}

var (
	reInteger  = regexp.MustCompile(`^-?\d+$`)
	reDecimal  = regexp.MustCompile(`^-?\d+\.\d+$`)
	reDate     = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reDatetime = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}`)
)

func detectType(val string) string {
	v := strings.TrimSpace(val)
	if v == "" {
		return TypeString
	}
	lower := strings.ToLower(v)
	if lower == "true" || lower == "false" || lower == "yes" || lower == "no" {
		return TypeBoolean
	}
	if reDatetime.MatchString(v) {
		return TypeDatetime
	}
	if reDate.MatchString(v) {
		return TypeDate
	}
	if reDecimal.MatchString(v) {
		return TypeDecimal
	}
	if reInteger.MatchString(v) {
		return TypeInteger
	}
	return TypeString
}

// --- Value application ---

// applyValue sets node.Text for all elements matching the path segments.
// Handles repeated elements by updating all matching siblings.
func applyValue(node *xmlNode, segs []string, val string) {
	if len(segs) == 0 {
		node.Text = val
		return
	}
	for _, child := range node.Children {
		if child.Name == segs[0] {
			applyValue(child, segs[1:], val)
		}
	}
}

// --- Value generation ---

const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func generateValue(fc FieldConfig, rng *rand.Rand) string {
	if fc.Mode == ModeFixed {
		return fc.Value
	}
	switch fc.Type {
	case TypeInteger:
		lo, hi := int64(fc.Min), int64(fc.Max)
		if hi <= lo {
			lo, hi = 1000, 9999
		}
		return strconv.FormatInt(lo+rng.Int63n(hi-lo+1), 10)

	case TypeDecimal:
		lo, hi := fc.Min, fc.Max
		if hi <= lo {
			lo, hi = 1.0, 100.0
		}
		dp := fc.DecimalPlaces
		if dp <= 0 {
			dp = 2
		}
		return strconv.FormatFloat(lo+rng.Float64()*(hi-lo), 'f', dp, 64)

	case TypeDate:
		return randomDate(rng, fc.DateStart, fc.DateEnd, "2006-01-02")

	case TypeDatetime:
		return randomDate(rng, fc.DateStart, fc.DateEnd, "2006-01-02T15:04:05")

	case TypeBoolean:
		if rng.Intn(2) == 0 {
			return "true"
		}
		return "false"

	default: // string
		n := fc.Length
		if n <= 0 {
			n = 8
		}
		b := make([]byte, n)
		for i := range b {
			b[i] = charset[rng.Intn(len(charset))]
		}
		return fc.Prefix + string(b)
	}
}

func randomDate(rng *rand.Rand, start, end, format string) string {
	const layout = "2006-01-02"
	now := time.Now()
	s := now.AddDate(-1, 0, 0)
	e := now
	if t, err := time.Parse(layout, start); err == nil {
		s = t
	}
	if t, err := time.Parse(layout, end); err == nil {
		e = t
	}
	if e.Before(s) {
		s, e = e, s
	}
	diff := e.Sub(s)
	if diff <= 0 {
		return s.Format(format)
	}
	return s.Add(time.Duration(rng.Int63n(int64(diff)))).Format(format)
}

// --- XML serialisation ---

func renderNode(node *xmlNode, depth int) string {
	indent := strings.Repeat("  ", depth)
	var sb strings.Builder
	sb.WriteString(indent + "<" + node.Name)
	for _, a := range node.NSDecls {
		if a.Name.Space == "xmlns" {
			sb.WriteString(fmt.Sprintf(` xmlns:%s="%s"`, a.Name.Local, a.Value))
		} else {
			sb.WriteString(fmt.Sprintf(` xmlns="%s"`, a.Value))
		}
	}
	for _, a := range node.Attrs {
		name := a.Name.Local
		if a.Name.Space != "" {
			name = a.Name.Space + ":" + name
		}
		sb.WriteString(fmt.Sprintf(` %s="%s"`, name, escAttr(a.Value)))
	}
	if node.Text == "" && len(node.Children) == 0 {
		sb.WriteString("/>\n")
		return sb.String()
	}
	sb.WriteString(">")
	if len(node.Children) > 0 {
		sb.WriteString("\n")
		for _, c := range node.Children {
			sb.WriteString(renderNode(c, depth+1))
		}
		sb.WriteString(indent + "</" + node.Name + ">\n")
	} else {
		sb.WriteString(escText(node.Text) + "</" + node.Name + ">\n")
	}
	return sb.String()
}

func escText(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

func escAttr(s string) string {
	s = escText(s)
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}
