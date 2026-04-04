// Package formatter provides XML and JSON formatting and validation.
package formatter

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// Result holds the output of a format or validate operation.
type Result struct {
	Formatted string
	Valid     bool
	Errors    []ParseError
}

// ParseError carries line/column position information for a syntax error.
type ParseError struct {
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Message string `json:"message"`
}

// XML pretty-prints XML content and reports any syntax errors.
func XML(content string) Result {
	formatted, errs := formatXML(content)
	return Result{Formatted: formatted, Valid: len(errs) == 0, Errors: errs}
}

// JSON pretty-prints JSON content and reports any syntax errors.
func JSON(content string) Result {
	formatted, errs := formatJSON(content)
	return Result{Formatted: formatted, Valid: len(errs) == 0, Errors: errs}
}

// formatJSON pretty-prints JSON and returns any parse errors with position info.
func formatJSON(content string) (string, []ParseError) {
	var buf bytes.Buffer
	dec := json.NewDecoder(strings.NewReader(content))
	dec.UseNumber()

	var raw json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		if syntaxErr, ok := err.(*json.SyntaxError); ok {
			line, col := offsetToLineCol(content, int(syntaxErr.Offset))
			return content, []ParseError{{Line: line, Column: col, Message: err.Error()}}
		}
		return content, []ParseError{{Line: 1, Column: 1, Message: err.Error()}}
	}

	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(raw); err != nil {
		return content, []ParseError{{Message: err.Error()}}
	}
	return strings.TrimRight(buf.String(), "\n"), nil
}

// formatXML pretty-prints XML preserving namespaces and attributes.
func formatXML(content string) (string, []ParseError) {
	dec := xml.NewDecoder(strings.NewReader(content))
	var buf strings.Builder
	indent := 0
	const tab = "  "

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			if xmlErr, ok := err.(*xml.SyntaxError); ok {
				return content, []ParseError{{Line: int(xmlErr.Line), Message: xmlErr.Error()}}
			}
			return content, []ParseError{{Message: err.Error()}}
		}

		switch t := tok.(type) {
		case xml.StartElement:
			buf.WriteString(strings.Repeat(tab, indent))
			buf.WriteString("<")
			buf.WriteString(renderName(t.Name))
			for _, a := range t.Attr {
				buf.WriteString(fmt.Sprintf(` %s="%s"`, renderName(a.Name), EscapeAttr(a.Value)))
			}
			buf.WriteString(">\n")
			indent++

		case xml.EndElement:
			indent--
			buf.WriteString(strings.Repeat(tab, indent))
			buf.WriteString("</")
			buf.WriteString(renderName(t.Name))
			buf.WriteString(">\n")

		case xml.CharData:
			trimmed := strings.TrimSpace(string(t))
			if trimmed != "" {
				s := buf.String()
				if strings.HasSuffix(s, ">\n") {
					buf.Reset()
					buf.WriteString(s[:len(s)-1])
					buf.WriteString(EscapeText(trimmed))
				}
			}

		case xml.Comment:
			buf.WriteString(strings.Repeat(tab, indent))
			buf.WriteString(fmt.Sprintf("<!--%s-->\n", string(t)))

		case xml.ProcInst:
			buf.WriteString(fmt.Sprintf("<?%s %s?>\n", t.Target, string(t.Inst)))

		case xml.Directive:
			buf.WriteString(fmt.Sprintf("<!%s>\n", string(t)))
		}
	}

	return strings.TrimRight(buf.String(), "\n"), nil
}

// renderName formats an xml.Name as "prefix:local" or "local".
func renderName(n xml.Name) string {
	if n.Space != "" {
		return n.Space + ":" + n.Local
	}
	return n.Local
}

// EscapeAttr escapes special characters for use in XML attribute values.
func EscapeAttr(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	return s
}

// EscapeText escapes special characters for use in XML text content.
func EscapeText(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

func offsetToLineCol(content string, offset int) (int, int) {
	line, col := 1, 1
	for i, ch := range content {
		if i >= offset {
			break
		}
		if ch == '\n' {
			line++
			col = 1
		} else {
			col++
		}
	}
	return line, col
}
