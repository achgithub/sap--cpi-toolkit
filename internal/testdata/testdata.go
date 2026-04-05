// Package testdata provides the XML test data generation engine.
// It parses a sample XML, identifies leaf fields with auto-detected types,
// and generates N varied XML documents returned as a ZIP archive.
//
// Generation modes per field:
//   - random     — generate values within type-specific constraints
//   - fixed      — always use the supplied literal value
//   - expression — build a value from a template string; {field.path} inserts
//     another field's generated value, {random} inserts a random value for
//     this field's type settings
//
// A global CSV can be supplied. When present, each CSV row becomes one
// document (count is ignored). CSV column headers must be field paths.
// CSV values override random/fixed modes for matched fields; expression
// fields can reference CSV-supplied values via {field.path}.
package testdata

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
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
	ModeRandom     = "random"
	ModeFixed      = "fixed"
	ModeExpression = "expression"
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
	Mode          string  `json:"mode"`                     // "random" | "fixed" | "expression"
	Value         string  `json:"value,omitempty"`          // fixed mode
	Expression    string  `json:"expression,omitempty"`     // expression mode template
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
	CSVData  string        `json:"csv_data,omitempty"` // raw CSV; when set, Count is ignored
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

// Generate produces XML documents with field values varied according to the
// supplied FieldConfigs, and returns the documents as a ZIP archive.
//
// If CSVData is set, each CSV row becomes one document (Count is ignored).
// Otherwise Count documents are generated (capped at 1000).
//
// Evaluation order per document:
//  1. CSV values (override random/fixed for matched paths)
//  2. random / fixed fields (non-expression, not covered by CSV)
//  3. expression fields (can reference values from steps 1 and 2)
func Generate(req GenerateRequest) ([]byte, error) {
	// Parse CSV if supplied
	var csvColumns map[string][]string
	csvRows := 0
	if strings.TrimSpace(req.CSVData) != "" {
		var err error
		csvColumns, csvRows, err = parseCSV(req.CSVData)
		if err != nil {
			return nil, fmt.Errorf("CSV: %w", err)
		}
	}

	count := req.Count
	if csvRows > 0 {
		count = csvRows
	}
	if count <= 0 {
		count = 1
	}
	if count > 1000 {
		count = 1000
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano())) //nolint:gosec

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for i := 0; i < count; i++ {
		root, err := parseXML(req.Template)
		if err != nil {
			return nil, fmt.Errorf("parse template: %w", err)
		}

		// Step 1: seed computed map with CSV values for this row
		computed := make(map[string]string)
		for path, vals := range csvColumns {
			if i < len(vals) {
				computed[path] = vals[i]
			}
		}

		// Step 2: random / fixed fields (CSV takes precedence)
		for _, fc := range req.Fields {
			if fc.Mode == ModeExpression {
				continue
			}
			if _, fromCSV := computed[fc.Path]; fromCSV {
				continue
			}
			computed[fc.Path] = generateValue(fc, rng)
		}

		// Step 3: expression fields
		for _, fc := range req.Fields {
			if fc.Mode != ModeExpression {
				continue
			}
			computed[fc.Path] = resolveExpression(fc.Expression, computed, fc, rng)
		}

		// Apply all computed values to the XML tree
		for path, val := range computed {
			segs := strings.Split(path, ".")
			if len(segs) > 1 && segs[0] == root.Name {
				applyValue(root, segs[1:], val)
			}
		}

		xmlContent := `<?xml version="1.0" encoding="UTF-8"?>` + "\n" + renderNode(root, 0)
		fw, err := zw.Create(fmt.Sprintf("record_%04d.xml", i+1))
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

// --- CSV parsing ---

// parseCSV reads CSV content (first row = headers = field paths) and returns
// a map of path → []string values (one entry per data row) plus the row count.
func parseCSV(data string) (map[string][]string, int, error) {
	r := csv.NewReader(strings.NewReader(data))
	r.TrimLeadingSpace = true
	records, err := r.ReadAll()
	if err != nil {
		return nil, 0, err
	}
	if len(records) < 2 {
		return nil, 0, fmt.Errorf("must have a header row and at least one data row")
	}
	headers := records[0]
	cols := make(map[string][]string, len(headers))
	for _, h := range headers {
		cols[strings.TrimSpace(h)] = nil
	}
	for _, row := range records[1:] {
		for i, h := range headers {
			h = strings.TrimSpace(h)
			val := ""
			if i < len(row) {
				val = strings.TrimSpace(row[i])
			}
			cols[h] = append(cols[h], val)
		}
	}
	return cols, len(records) - 1, nil
}

// --- Expression resolution ---

// tokenRE matches {anything} tokens in an expression string.
var tokenRE = regexp.MustCompile(`\{([^}]+)\}`)

// resolveExpression replaces {field.path} tokens with their computed values
// and {random} with a freshly generated value for this field's type settings.
// Unresolved tokens are left as-is.
func resolveExpression(expr string, computed map[string]string, fc FieldConfig, rng *rand.Rand) string {
	return tokenRE.ReplaceAllStringFunc(expr, func(tok string) string {
		key := tok[1 : len(tok)-1] // strip { }
		if key == "random" {
			rfc := fc
			rfc.Mode = ModeRandom
			return generateValue(rfc, rng)
		}
		if val, ok := computed[key]; ok {
			return val
		}
		return tok // leave unresolved tokens unchanged
	})
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
