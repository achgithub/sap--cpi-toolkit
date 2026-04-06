// Package edi provides EDIFACT and ANSI X12 parsing, conversion, and generation.
//
// Supported operations:
//   - Parse: raw EDI → structured segments + summary + validation errors
//   - ToXML: ParseResult → SAP CPI-compatible XML representation
//   - FromXML: XML → raw EDI (round-trip from ToXML output)
//   - Generate: produce a syntactically valid sample EDI file by message type
//
// XML format used for ToXML / FromXML:
//
//	<EDIMessage standard="EDIFACT">
//	  <Segment tag="UNB">
//	    <Element index="1">
//	      <Component index="1">UNOA</Component>
//	      <Component index="2">1</Component>
//	    </Element>
//	    <Element index="2">SENDER</Element>
//	  </Segment>
//	</EDIMessage>
package edi

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

// --- Public types ---

// ParsedSegment is a single EDI segment.
// Elements[i] holds the composite components for element i+1.
// A non-composite element has Elements[i] = []string{value}.
type ParsedSegment struct {
	Tag      string     `json:"tag"`
	Elements [][]string `json:"elements"`
}

// Summary extracts key interchange fields for quick display.
type Summary struct {
	SenderID    string `json:"sender_id"`
	ReceiverID  string `json:"receiver_id"`
	MessageType string `json:"message_type"`
	ReferenceNo string `json:"reference_no"`
	Date        string `json:"date"`
}

// ParseResult is returned by Parse.
type ParseResult struct {
	Standard string          `json:"standard"` // "EDIFACT" or "X12"
	Segments []ParsedSegment `json:"segments"`
	Summary  Summary         `json:"summary"`
	Errors   []string        `json:"errors,omitempty"`
}

// LineItem represents one order/invoice line in a generated message.
type LineItem struct {
	ItemNumber string  `json:"item_number"`
	Quantity   float64 `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
}

// GenerateRequest is the payload for Generate.
type GenerateRequest struct {
	Standard    string     `json:"standard"`     // "EDIFACT" or "X12"
	MessageType string     `json:"message_type"` // "ORDERS","INVOIC","DESADV","850","810","856"
	SenderID    string     `json:"sender_id"`
	ReceiverID  string     `json:"receiver_id"`
	ReferenceNo string     `json:"reference_no"`
	LineItems   []LineItem `json:"line_items"`
}

// --- XML intermediate types (for ToXML / FromXML) ---

type xmlEDIMessage struct {
	XMLName  xml.Name     `xml:"EDIMessage"`
	Standard string       `xml:"standard,attr"`
	Segments []xmlSegment `xml:"Segment"`
}

type xmlSegment struct {
	Tag      string       `xml:"tag,attr"`
	Elements []xmlElement `xml:"Element"`
}

type xmlElement struct {
	Index      int            `xml:"index,attr"`
	Value      string         `xml:",chardata"`
	Components []xmlComponent `xml:"Component"`
}

type xmlComponent struct {
	Index int    `xml:"index,attr"`
	Value string `xml:",chardata"`
}

// --- Public API ---

// Parse auto-detects the EDI standard (EDIFACT or X12) and returns structured segments.
func Parse(content string) (ParseResult, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return ParseResult{}, fmt.Errorf("empty EDI content")
	}
	if strings.HasPrefix(content, "UNA") || strings.HasPrefix(content, "UNB") {
		return parseEDIFACT(content)
	}
	if strings.HasPrefix(content, "ISA") {
		return parseX12(content)
	}
	return ParseResult{}, fmt.Errorf("cannot detect EDI standard: content must start with UNA/UNB (EDIFACT) or ISA (X12)")
}

// ToXML converts a ParseResult into the toolkit's EDI XML format.
func ToXML(result *ParseResult) (string, error) {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(fmt.Sprintf(`<EDIMessage standard=%q>`+"\n", result.Standard))

	for _, seg := range result.Segments {
		sb.WriteString(fmt.Sprintf(`  <Segment tag=%q>`+"\n", seg.Tag))
		for i, elem := range seg.Elements {
			if len(elem) == 1 {
				sb.WriteString(fmt.Sprintf(`    <Element index="%d">%s</Element>`+"\n", i+1, xmlEsc(elem[0])))
			} else {
				sb.WriteString(fmt.Sprintf(`    <Element index="%d">`+"\n", i+1))
				for j, comp := range elem {
					sb.WriteString(fmt.Sprintf(`      <Component index="%d">%s</Component>`+"\n", j+1, xmlEsc(comp)))
				}
				sb.WriteString(`    </Element>` + "\n")
			}
		}
		sb.WriteString(`  </Segment>` + "\n")
	}
	sb.WriteString(`</EDIMessage>`)
	return sb.String(), nil
}

// FromXML converts the toolkit's EDI XML format back to raw EDI.
// standard must be "EDIFACT" or "X12".
func FromXML(xmlContent string) (string, error) {
	var msg xmlEDIMessage
	if err := xml.Unmarshal([]byte(xmlContent), &msg); err != nil {
		return "", fmt.Errorf("XML parse: %w", err)
	}
	switch strings.ToUpper(msg.Standard) {
	case "EDIFACT":
		return buildEDIFACT(msg.Segments), nil
	case "X12":
		return buildX12(msg.Segments), nil
	default:
		return "", fmt.Errorf("unknown standard %q in XML (expected EDIFACT or X12)", msg.Standard)
	}
}

// Generate creates a syntactically valid sample EDI message.
func Generate(req GenerateRequest) (string, error) {
	if len(req.LineItems) == 0 {
		req.LineItems = []LineItem{
			{ItemNumber: "ITEM-001", Quantity: 10, UnitPrice: 25.99},
			{ItemNumber: "ITEM-002", Quantity: 5, UnitPrice: 99.00},
		}
	}
	if req.SenderID == "" {
		req.SenderID = "SENDER"
	}
	if req.ReceiverID == "" {
		req.ReceiverID = "RECEIVER"
	}
	if req.ReferenceNo == "" {
		req.ReferenceNo = "REF00001"
	}

	switch strings.ToUpper(req.Standard) {
	case "EDIFACT":
		return generateEDIFACT(req)
	case "X12":
		return generateX12(req)
	default:
		return "", fmt.Errorf("unknown standard %q (expected EDIFACT or X12)", req.Standard)
	}
}

// --- EDIFACT parser ---

func parseEDIFACT(content string) (ParseResult, error) {
	// Default EDIFACT separators
	elemSep := '+'
	compSep := ':'
	segTerm := '\''
	relChar := '?'

	// UNA overrides separators (UNA:+.? ')
	if strings.HasPrefix(content, "UNA") && len(content) >= 9 {
		compSep = rune(content[3])
		elemSep = rune(content[4])
		relChar = rune(content[6])
		segTerm = rune(content[8])
		// Skip past UNA segment (find first segTerm)
		idx := strings.IndexRune(content, segTerm)
		if idx >= 0 {
			content = content[idx+1:]
		}
	}

	rawSegs := splitEDI(content, segTerm, relChar)
	var segments []ParsedSegment
	for _, raw := range rawSegs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		elems := splitEDI(raw, elemSep, relChar)
		tag := elems[0]
		var parsedElems [][]string
		for _, el := range elems[1:] {
			comps := splitEDI(el, compSep, relChar)
			parsedElems = append(parsedElems, comps)
		}
		segments = append(segments, ParsedSegment{Tag: tag, Elements: parsedElems})
	}

	result := ParseResult{
		Standard: "EDIFACT",
		Segments: segments,
		Summary:  extractEDIFACTSummary(segments),
		Errors:   validateEDIFACT(segments),
	}
	return result, nil
}

func extractEDIFACTSummary(segs []ParsedSegment) Summary {
	var s Summary
	for _, seg := range segs {
		switch seg.Tag {
		case "UNB":
			s.SenderID = elemComp(seg, 1, 0)
			s.ReceiverID = elemComp(seg, 2, 0)
			s.Date = elemComp(seg, 3, 0)
			s.ReferenceNo = elemComp(seg, 4, 0)
		case "UNH":
			s.MessageType = elemComp(seg, 1, 0)
		case "BGM":
			if s.ReferenceNo == "" {
				s.ReferenceNo = elemComp(seg, 1, 0)
			}
		}
	}
	return s
}

func validateEDIFACT(segs []ParsedSegment) []string {
	var errs []string
	tags := make(map[string]int)
	for _, s := range segs {
		tags[s.Tag]++
	}
	for _, required := range []string{"UNB", "UNH", "UNT", "UNZ"} {
		if tags[required] == 0 {
			errs = append(errs, fmt.Sprintf("missing mandatory segment: %s", required))
		}
	}
	if tags["UNH"] != tags["UNT"] {
		errs = append(errs, "UNH/UNT count mismatch — each message group must have matching open/close")
	}
	return errs
}

// --- X12 parser ---

func parseX12(content string) (ParseResult, error) {
	content = strings.TrimSpace(content)
	if len(content) < 106 {
		return ParseResult{}, fmt.Errorf("ISA segment must be at least 106 characters")
	}
	elemSep := rune(content[3])
	compSep := rune(content[104])
	segTerm := rune(content[105])

	rawSegs := strings.Split(content, string(segTerm))
	var segments []ParsedSegment
	for _, raw := range rawSegs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		elems := strings.Split(raw, string(elemSep))
		tag := strings.TrimSpace(elems[0])
		var parsedElems [][]string
		for _, el := range elems[1:] {
			comps := strings.Split(el, string(compSep))
			parsedElems = append(parsedElems, comps)
		}
		segments = append(segments, ParsedSegment{Tag: tag, Elements: parsedElems})
	}

	result := ParseResult{
		Standard: "X12",
		Segments: segments,
		Summary:  extractX12Summary(segments),
		Errors:   validateX12(segments),
	}
	return result, nil
}

func extractX12Summary(segs []ParsedSegment) Summary {
	var s Summary
	for _, seg := range segs {
		switch seg.Tag {
		case "ISA":
			s.SenderID = strings.TrimSpace(elemComp(seg, 5, 0))
			s.ReceiverID = strings.TrimSpace(elemComp(seg, 7, 0))
			s.Date = elemComp(seg, 8, 0)
			s.ReferenceNo = elemComp(seg, 12, 0)
		case "ST":
			s.MessageType = elemComp(seg, 0, 0)
		case "BEG", "BIG", "BSN":
			if s.ReferenceNo == "" {
				s.ReferenceNo = elemComp(seg, 2, 0)
			}
		}
	}
	return s
}

func validateX12(segs []ParsedSegment) []string {
	var errs []string
	tags := make(map[string]int)
	for _, s := range segs {
		tags[s.Tag]++
	}
	for _, required := range []string{"ISA", "GS", "ST", "SE", "GE", "IEA"} {
		if tags[required] == 0 {
			errs = append(errs, fmt.Sprintf("missing mandatory segment: %s", required))
		}
	}
	if tags["ST"] != tags["SE"] {
		errs = append(errs, "ST/SE count mismatch")
	}
	if tags["GS"] != tags["GE"] {
		errs = append(errs, "GS/GE count mismatch")
	}
	return errs
}

// --- EDI reconstruction from XML ---

func buildEDIFACT(segs []xmlSegment) string {
	var parts []string
	for _, seg := range segs {
		parts = append(parts, buildEDIFACTSegment(seg))
	}
	return strings.Join(parts, "'") + "'"
}

func buildEDIFACTSegment(seg xmlSegment) string {
	parts := []string{seg.Tag}
	for _, elem := range seg.Elements {
		if len(elem.Components) > 0 {
			comps := make([]string, len(elem.Components))
			for i, c := range elem.Components {
				comps[i] = c.Value
			}
			parts = append(parts, strings.Join(comps, ":"))
		} else {
			parts = append(parts, strings.TrimSpace(elem.Value))
		}
	}
	return strings.Join(parts, "+")
}

func buildX12(segs []xmlSegment) string {
	var parts []string
	for _, seg := range segs {
		parts = append(parts, buildX12Segment(seg))
	}
	return strings.Join(parts, "~") + "~"
}

func buildX12Segment(seg xmlSegment) string {
	parts := []string{seg.Tag}
	for _, elem := range seg.Elements {
		if len(elem.Components) > 0 {
			comps := make([]string, len(elem.Components))
			for i, c := range elem.Components {
				comps[i] = c.Value
			}
			parts = append(parts, strings.Join(comps, ":"))
		} else {
			parts = append(parts, strings.TrimSpace(elem.Value))
		}
	}
	return strings.Join(parts, "*")
}

// --- Generators ---

func generateEDIFACT(req GenerateRequest) (string, error) {
	now := time.Now()
	date := now.Format("060102")
	clock := now.Format("1504")
	ref := padRight(req.ReferenceNo, 14)
	sender := req.SenderID
	receiver := req.ReceiverID

	var lineSegs []string
	for i, item := range req.LineItems {
		n := i + 1
		switch strings.ToUpper(req.MessageType) {
		case "ORDERS":
			lineSegs = append(lineSegs,
				fmt.Sprintf("LIN+%d++%s:SV", n, item.ItemNumber),
				fmt.Sprintf("QTY+21:%.0f", item.Quantity),
				fmt.Sprintf("PRI+AAA:%.2f:EA", item.UnitPrice),
			)
		case "INVOIC":
			lineSegs = append(lineSegs,
				fmt.Sprintf("LIN+%d++%s:SV", n, item.ItemNumber),
				fmt.Sprintf("QTY+47:%.0f", item.Quantity),
				fmt.Sprintf("PRI+AAA:%.2f:EA", item.UnitPrice),
				fmt.Sprintf("MOA+203:%.2f", item.Quantity*item.UnitPrice),
			)
		case "DESADV":
			lineSegs = append(lineSegs,
				fmt.Sprintf("LIN+%d++%s:SV", n, item.ItemNumber),
				fmt.Sprintf("QTY+12:%.0f", item.Quantity),
			)
		}
	}

	var segs []string
	segs = append(segs,
		fmt.Sprintf("UNB+UNOA:1+%s:1+%s:1+%s:%s+%s", sender, receiver, date, clock, ref),
		"UNH+1+"+strings.ToUpper(req.MessageType)+":D:96A:UN",
		"BGM+220+"+req.ReferenceNo+"+9",
		"DTM+137:20"+date+":102",
		"NAD+BY+++"+sender,
		"NAD+SU+++"+receiver,
	)
	segs = append(segs, lineSegs...)
	segs = append(segs,
		"UNS+S",
		fmt.Sprintf("CNT+2:%d", len(req.LineItems)),
		fmt.Sprintf("UNT+%d+1", len(segs)+2), // UNH through UNT inclusive
		fmt.Sprintf("UNZ+1+%s", ref),
	)

	// Fix UNT count: segments from UNH to UNT inclusive
	untIdx := len(segs) - 2
	untCount := untIdx // UNH is index 1 (0-based), UNT is at untIdx; count = untIdx
	segs[untIdx] = fmt.Sprintf("UNT+%d+1", untCount)

	return strings.Join(segs, "'\n") + "'", nil
}

func generateX12(req GenerateRequest) (string, error) {
	now := time.Now()
	date := now.Format("20060102")
	clock := now.Format("1504")
	refNum := padLeft(strings.ReplaceAll(req.ReferenceNo, " ", ""), 9, "0")
	sender := padRight(req.SenderID, 15)
	receiver := padRight(req.ReceiverID, 15)

	gsCode := map[string]string{
		"850": "PO", "810": "IN", "856": "SH",
	}[strings.ToUpper(req.MessageType)]
	if gsCode == "" {
		gsCode = "PO"
	}

	var lineSegs []string
	for i, item := range req.LineItems {
		n := i + 1
		switch strings.ToUpper(req.MessageType) {
		case "850":
			lineSegs = append(lineSegs,
				fmt.Sprintf("PO1*%d*%.0f*EA*%.2f**IN*%s", n, item.Quantity, item.UnitPrice, item.ItemNumber),
			)
		case "810":
			lineSegs = append(lineSegs,
				fmt.Sprintf("IT1*%d*%.0f*EA*%.2f**IN*%s", n, item.Quantity, item.UnitPrice, item.ItemNumber),
			)
		case "856":
			lineSegs = append(lineSegs,
				fmt.Sprintf("HL*%d**I", n+1),
				fmt.Sprintf("LIN**IN*%s", item.ItemNumber),
				fmt.Sprintf("SN1**%.0f*EA", item.Quantity),
			)
		}
	}

	var segs []string
	segs = append(segs,
		fmt.Sprintf("ISA*00*          *00*          *ZZ*%s*ZZ*%s*%s*%s*^*00501*%s*0*P*:", sender, receiver, now.Format("060102"), clock, refNum),
		fmt.Sprintf("GS*%s*%s*%s*%s*%s*1*X*005010", gsCode, strings.TrimSpace(req.SenderID), strings.TrimSpace(req.ReceiverID), date, clock),
		fmt.Sprintf("ST*%s*0001", strings.ToUpper(req.MessageType)),
	)

	switch strings.ToUpper(req.MessageType) {
	case "850":
		segs = append(segs, fmt.Sprintf("BEG*00*NE*%s**%s", req.ReferenceNo, date))
	case "810":
		segs = append(segs, fmt.Sprintf("BIG*%s*%s**%s", date, req.ReferenceNo, req.ReferenceNo))
	case "856":
		segs = append(segs,
			fmt.Sprintf("BSN*00*%s*%s*%s", req.ReferenceNo, date, clock),
			"HL*1**S",
		)
	}

	segs = append(segs, lineSegs...)

	if req.MessageType == "850" || req.MessageType == "810" {
		segs = append(segs, fmt.Sprintf("CTT*%d", len(req.LineItems)))
	}

	stIdx := 2 // ST is at index 2
	seCount := len(segs) - stIdx + 1
	segs = append(segs,
		fmt.Sprintf("SE*%d*0001", seCount),
		"GE*1*1",
		fmt.Sprintf("IEA*1*%s", refNum),
	)

	return strings.Join(segs, "~\n") + "~", nil
}

// --- Helpers ---

// splitEDI splits s by sep, treating relChar+sep as a literal sep (no split).
func splitEDI(s string, sep, rel rune) []string {
	var parts []string
	var cur strings.Builder
	rs := []rune(s)
	for i := 0; i < len(rs); {
		if rs[i] == rel && i+1 < len(rs) {
			cur.WriteRune(rs[i+1])
			i += 2
		} else if rs[i] == sep {
			parts = append(parts, cur.String())
			cur.Reset()
			i++
		} else {
			cur.WriteRune(rs[i])
			i++
		}
	}
	parts = append(parts, cur.String())
	return parts
}

// elemComp safely returns segment element[elemIdx], component[compIdx].
func elemComp(seg ParsedSegment, elemIdx, compIdx int) string {
	if elemIdx >= len(seg.Elements) {
		return ""
	}
	el := seg.Elements[elemIdx]
	if compIdx >= len(el) {
		return ""
	}
	return el[compIdx]
}

func padRight(s string, n int) string {
	if len(s) >= n {
		return s[:n]
	}
	return s + strings.Repeat(" ", n-len(s))
}

func padLeft(s string, n int, pad string) string {
	for len(s) < n {
		s = pad + s
	}
	return s[len(s)-n:]
}

func xmlEsc(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}
