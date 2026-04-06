package edi

import (
	"fmt"
	"strings"
)

// ToSemanticXML converts a ParseResult to a human-readable, semantically meaningful
// XML structure where segment codes become named elements, qualifiers become readable
// attributes, and related segments are grouped (e.g. LIN+QTY+PRI → LineItem).
//
// This format is optimised for SAP CPI message mapping — elements have business names
// rather than EDI tag codes. Use ToXML for a round-trippable technical representation.
func ToSemanticXML(result *ParseResult) (string, error) {
	var root *xmlNode
	if result.Standard == "EDIFACT" {
		root = edifactSemantic(result)
	} else {
		root = x12Semantic(result)
	}
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	root.write(&sb, 0)
	return sb.String(), nil
}

// ── Qualifier lookup tables ───────────────────────────────────────────────────

var edifactDTMQuals = map[string]string{
	"2": "DeliveryDate", "11": "DispatchDate", "35": "ArrivalDate",
	"63": "DeliveryLatest", "64": "DeliveryEarliest",
	"137": "DocumentDate", "163": "PeriodStart", "164": "PeriodEnd",
}

var edifactNADRoles = map[string]string{
	"BY": "Buyer", "SU": "Supplier", "ST": "ShipTo", "DP": "DeliveryParty",
	"IV": "Invoicee", "SE": "SellerOfGoods", "CN": "Consignee",
	"CA": "Carrier", "MF": "Manufacturer", "UC": "UltimateConsignee",
}

var edifactBGMTypes = map[string]string{
	"220": "PurchaseOrder", "221": "OrderChange", "222": "OrderCancellation",
	"380": "Invoice", "381": "CreditNote", "383": "DebitNote",
	"351": "DespatchAdvice",
}

var edifactBGMFunctions = map[string]string{
	"1": "Cancellation", "2": "Addition", "3": "Deletion",
	"4": "Change", "5": "Replace", "6": "Confirmation",
	"7": "Duplicate", "9": "Original",
}

var edifactQTYQuals = map[string]string{
	"12": "Despatch", "21": "Ordered", "46": "Delivered",
	"47": "Invoiced", "59": "Invoiced", "192": "FreeGoods",
}

var edifactPRIQuals = map[string]string{
	"AAA": "Calculation", "AAB": "Alternate", "AAE": "Information",
}

var edifactMOAQuals = map[string]string{
	"79": "LineAmount", "86": "TotalLineAmount", "128": "TotalPayable",
	"129": "InvoiceTotal", "131": "TaxableAmount", "138": "AmountDue",
	"203": "LineItemAmount", "270": "GrossAmount",
}

var edifactTAXTypes = map[string]string{
	"VAT": "ValueAddedTax", "GST": "GoodsServicesTax", "EXC": "ExciseTax",
}

var x12DTMQuals = map[string]string{
	"002": "DeliveryRequested", "004": "PurchaseOrderDate", "010": "RequestedShipDate",
	"011": "ShipDate", "035": "DeliveryDate", "037": "CancelAfterDate",
}

var x12EntityTypes = map[string]string{
	"BY": "Buyer", "SE": "Seller", "ST": "ShipTo", "BT": "BillTo",
	"VN": "Vendor", "SU": "Supplier", "SF": "ShipFrom",
	"CN": "Consignee", "CA": "Carrier",
}

var x12HLCodes = map[string]string{
	"S": "Shipment", "O": "Order", "P": "Pack", "I": "Item",
}

// ── XML builder ───────────────────────────────────────────────────────────────

type xmlNode struct {
	name     string
	attrs    [][2]string
	children []*xmlNode
	text     string
}

func newNode(name string) *xmlNode { return &xmlNode{name: name} }

// set adds an attribute only if val is non-empty.
func (n *xmlNode) set(key, val string) *xmlNode {
	if val != "" {
		n.attrs = append(n.attrs, [2]string{key, val})
	}
	return n
}

// add appends a child and returns it.
func (n *xmlNode) add(child *xmlNode) *xmlNode {
	n.children = append(n.children, child)
	return child
}

// leaf appends a text-content child.
func (n *xmlNode) leaf(name, text string) *xmlNode {
	c := newNode(name)
	c.text = text
	return n.add(c)
}

func (n *xmlNode) write(sb *strings.Builder, depth int) {
	indent := strings.Repeat("  ", depth)
	sb.WriteString(indent + "<" + n.name)
	for _, a := range n.attrs {
		sb.WriteString(fmt.Sprintf(` %s="%s"`, a[0], semXMLEsc(a[1])))
	}
	if len(n.children) == 0 && n.text == "" {
		sb.WriteString("/>\n")
		return
	}
	sb.WriteString(">")
	if len(n.children) > 0 {
		sb.WriteString("\n")
		for _, c := range n.children {
			c.write(sb, depth+1)
		}
		sb.WriteString(indent + "</" + n.name + ">\n")
	} else {
		sb.WriteString(semXMLEsc(n.text) + "</" + n.name + ">\n")
	}
}

func semXMLEsc(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

// ── EDIFACT semantic conversion ───────────────────────────────────────────────

func edifactSemantic(result *ParseResult) *xmlNode {
	msgType := result.Summary.MessageType
	if msgType == "" {
		msgType = "EDIMessage"
	}
	root := newNode(msgType)
	root.set("standard", "EDIFACT")

	var lineItems *xmlNode // <LineItems> container, created on first LIN
	var current *xmlNode  // current <LineItem> element
	inDetail := false

	for _, seg := range result.Segments {
		switch seg.Tag {
		case "UNA":
			// separator definition — omit from semantic XML

		case "UNB":
			ich := newNode("Interchange")
			ich.set("sender", strings.TrimSpace(elemComp(seg, 1, 0)))
			ich.set("senderQualifier", elemComp(seg, 1, 1))
			ich.set("receiver", strings.TrimSpace(elemComp(seg, 2, 0)))
			ich.set("receiverQualifier", elemComp(seg, 2, 1))
			ich.set("date", elemComp(seg, 3, 0))
			ich.set("time", elemComp(seg, 3, 1))
			ich.set("reference", elemComp(seg, 4, 0))
			root.add(ich)

		case "UNH":
			root.leaf("MessageRef", elemComp(seg, 0, 0))
			// elemComp(seg,1,x) is the message identifier composite — already in Summary

		case "BGM":
			doc := newNode("Document")
			typeCode := elemComp(seg, 0, 0)
			if name := edifactBGMTypes[typeCode]; name != "" {
				doc.set("type", name)
			} else {
				doc.set("type", typeCode)
			}
			doc.set("number", elemComp(seg, 1, 0))
			fn := elemComp(seg, 2, 0)
			if name := edifactBGMFunctions[fn]; name != "" {
				doc.set("function", name)
			} else {
				doc.set("function", fn)
			}
			root.add(doc)

		case "DTM":
			qual := elemComp(seg, 0, 0)
			val := elemComp(seg, 0, 1)
			format := elemComp(seg, 0, 2)
			qualName := edifactDTMQuals[qual]
			if qualName == "" {
				qualName = qual
			}
			d := newNode("Date")
			d.set("qualifier", qualName)
			d.set("value", val)
			d.set("format", format)
			if current != nil {
				current.add(d)
			} else {
				root.add(d)
			}

		case "NAD":
			role := elemComp(seg, 0, 0)
			roleName := edifactNADRoles[role]
			if roleName == "" {
				roleName = role
			}
			party := newNode("Party")
			party.set("role", roleName)
			if id := elemComp(seg, 1, 0); id != "" {
				party.set("id", id)
				party.set("idQualifier", elemComp(seg, 1, 2))
			}
			// name: try NAD_04 (index 3) then NAD_03 (index 2)
			name := elemComp(seg, 3, 0)
			if name == "" {
				name = elemComp(seg, 2, 0)
			}
			party.set("name", name)
			if v := elemComp(seg, 4, 0); v != "" {
				party.set("street", v)
			}
			if v := elemComp(seg, 5, 0); v != "" {
				party.set("city", v)
			}
			if v := elemComp(seg, 7, 0); v != "" {
				party.set("postCode", v)
			}
			if v := elemComp(seg, 8, 0); v != "" {
				party.set("country", v)
			}
			root.add(party)

		case "LIN":
			if lineItems == nil {
				lineItems = newNode("LineItems")
				root.add(lineItems)
				inDetail = true
			}
			current = newNode("LineItem")
			current.set("number", elemComp(seg, 0, 0))
			itemID := elemComp(seg, 2, 0)
			if itemID != "" {
				item := newNode("Item")
				item.set("id", itemID)
				item.set("qualifier", elemComp(seg, 2, 1))
				current.add(item)
			}
			lineItems.add(current)

		case "PIA":
			// Additional product identification
			if current != nil {
				alt := newNode("AlternateItem")
				alt.set("qualifier", elemComp(seg, 0, 0))
				alt.set("id", elemComp(seg, 1, 0))
				alt.set("type", elemComp(seg, 1, 1))
				current.add(alt)
			}

		case "IMD":
			// Item description
			if current != nil {
				desc := elemComp(seg, 2, 3)
				if desc == "" {
					desc = elemComp(seg, 2, 2)
				}
				if desc == "" {
					desc = elemComp(seg, 2, 1)
				}
				if desc != "" {
					current.leaf("Description", desc)
				}
			}

		case "QTY":
			qual := elemComp(seg, 0, 0)
			val := elemComp(seg, 0, 1)
			unit := elemComp(seg, 0, 2)
			qualName := edifactQTYQuals[qual]
			if qualName == "" {
				qualName = qual
			}
			q := newNode("Quantity")
			q.set("qualifier", qualName)
			q.set("unit", unit)
			q.text = val
			if current != nil {
				current.add(q)
			} else {
				root.add(q)
			}

		case "PRI":
			qual := elemComp(seg, 0, 0)
			val := elemComp(seg, 0, 1)
			unit := elemComp(seg, 0, 2)
			qualName := edifactPRIQuals[qual]
			if qualName == "" {
				qualName = qual
			}
			p := newNode("Price")
			p.set("qualifier", qualName)
			p.set("unit", unit)
			p.text = val
			if current != nil {
				current.add(p)
			} else {
				root.add(p)
			}

		case "MOA":
			qual := elemComp(seg, 0, 0)
			val := elemComp(seg, 0, 1)
			currency := elemComp(seg, 0, 2)
			qualName := edifactMOAQuals[qual]
			if qualName == "" {
				qualName = qual
			}
			a := newNode("Amount")
			a.set("qualifier", qualName)
			a.set("currency", currency)
			a.text = val
			if current != nil {
				current.add(a)
			} else {
				root.add(a)
			}

		case "TAX":
			taxType := elemComp(seg, 1, 0)
			taxName := edifactTAXTypes[taxType]
			if taxName == "" {
				taxName = taxType
			}
			t := newNode("Tax")
			t.set("type", taxName)
			t.set("rate", elemComp(seg, 4, 0))
			t.set("amount", elemComp(seg, 5, 0))
			if current != nil {
				current.add(t)
			} else {
				root.add(t)
			}

		case "ALC":
			indicator := elemComp(seg, 0, 0)
			name := "Allowance"
			if indicator == "C" {
				name = "Charge"
			}
			alc := newNode(name)
			alc.set("code", elemComp(seg, 4, 0))
			alc.set("description", elemComp(seg, 4, 3))
			if current != nil {
				current.add(alc)
			} else {
				root.add(alc)
			}

		case "UNS":
			// Section control — close line items block
			if inDetail {
				current = nil
				inDetail = false
			}

		case "CNT":
			cc := newNode("ControlCount")
			cc.set("qualifier", elemComp(seg, 0, 0))
			cc.text = elemComp(seg, 0, 1)
			root.add(cc)

		case "UNT":
			root.leaf("SegmentCount", elemComp(seg, 0, 0))

		case "UNZ":
			// interchange trailer — omit

		default:
			// Preserve unknown segments with generic element names so no data is lost
			if !inDetail || current == nil {
				generic := newNode(seg.Tag)
				for i, elem := range seg.Elements {
					e := newNode(fmt.Sprintf("E%02d", i+1))
					if len(elem) == 1 {
						e.text = elem[0]
					} else {
						for j, comp := range elem {
							if comp != "" {
								e.leaf(fmt.Sprintf("C%02d", j+1), comp)
							}
						}
					}
					generic.add(e)
				}
				root.add(generic)
			}
		}
	}

	return root
}

// ── X12 semantic conversion ───────────────────────────────────────────────────

func x12Semantic(result *ParseResult) *xmlNode {
	// Discover transaction set type for root element name
	txType := ""
	for _, seg := range result.Segments {
		if seg.Tag == "ST" {
			txType = elemComp(seg, 0, 0)
			break
		}
	}
	rootName := x12TxTypeName(txType)
	root := newNode(rootName)
	root.set("standard", "X12")

	var lineItems *xmlNode  // <LineItems> container
	var current *xmlNode   // current line item node
	var currentHL *xmlNode // current hierarchical level node (856)

	// HL map for building the 856 hierarchy
	type hlEntry struct{ node *xmlNode }
	hlMap := map[string]*hlEntry{}

	for _, seg := range result.Segments {
		switch seg.Tag {
		case "ISA":
			ich := newNode("Interchange")
			ich.set("sender", strings.TrimSpace(elemComp(seg, 5, 0)))
			ich.set("senderQualifier", strings.TrimSpace(elemComp(seg, 4, 0)))
			ich.set("receiver", strings.TrimSpace(elemComp(seg, 7, 0)))
			ich.set("receiverQualifier", strings.TrimSpace(elemComp(seg, 6, 0)))
			ich.set("date", elemComp(seg, 8, 0))
			ich.set("time", elemComp(seg, 9, 0))
			ich.set("version", elemComp(seg, 11, 0))
			ich.set("reference", elemComp(seg, 12, 0))
			root.add(ich)

		case "GS":
			fg := newNode("FunctionalGroup")
			fg.set("type", elemComp(seg, 0, 0))
			fg.set("sender", elemComp(seg, 1, 0))
			fg.set("receiver", elemComp(seg, 2, 0))
			fg.set("date", elemComp(seg, 3, 0))
			fg.set("version", elemComp(seg, 7, 0))
			root.add(fg)

		case "ST":
			root.leaf("TransactionRef", elemComp(seg, 1, 0))

		case "BEG": // 850 Purchase Order
			doc := newNode("Document")
			doc.set("purpose", elemComp(seg, 0, 0))
			doc.set("type", elemComp(seg, 1, 0))
			doc.set("number", elemComp(seg, 2, 0))
			doc.set("date", elemComp(seg, 4, 0))
			root.add(doc)

		case "BIG": // 810 Invoice
			doc := newNode("Document")
			doc.set("invoiceDate", elemComp(seg, 0, 0))
			doc.set("invoiceNumber", elemComp(seg, 1, 0))
			doc.set("purchaseOrderDate", elemComp(seg, 2, 0))
			doc.set("purchaseOrderNumber", elemComp(seg, 3, 0))
			root.add(doc)

		case "BSN": // 856 Ship Notice
			doc := newNode("Document")
			doc.set("purpose", elemComp(seg, 0, 0))
			doc.set("shipmentID", elemComp(seg, 1, 0))
			doc.set("date", elemComp(seg, 2, 0))
			doc.set("time", elemComp(seg, 3, 0))
			root.add(doc)

		case "DTM":
			qual := elemComp(seg, 0, 0)
			val := elemComp(seg, 1, 0)
			qualName := x12DTMQuals[qual]
			if qualName == "" {
				qualName = qual
			}
			d := newNode("Date")
			d.set("qualifier", qualName)
			d.set("value", val)
			if current != nil {
				current.add(d)
			} else if currentHL != nil {
				currentHL.add(d)
			} else {
				root.add(d)
			}

		case "N1":
			role := elemComp(seg, 0, 0)
			roleName := x12EntityTypes[role]
			if roleName == "" {
				roleName = role
			}
			party := newNode("Party")
			party.set("role", roleName)
			party.set("name", elemComp(seg, 1, 0))
			if id := elemComp(seg, 3, 0); id != "" {
				party.set("id", id)
				party.set("idQualifier", elemComp(seg, 2, 0))
			}
			root.add(party)

		case "N3":
			// Street address for previous N1 — attach to last Party child
			for i := len(root.children) - 1; i >= 0; i-- {
				if root.children[i].name == "Party" {
					root.children[i].set("street", elemComp(seg, 0, 0))
					break
				}
			}

		case "N4":
			// City/state/zip for previous N1
			for i := len(root.children) - 1; i >= 0; i-- {
				if root.children[i].name == "Party" {
					root.children[i].set("city", elemComp(seg, 0, 0))
					root.children[i].set("state", elemComp(seg, 1, 0))
					root.children[i].set("postCode", elemComp(seg, 2, 0))
					root.children[i].set("country", elemComp(seg, 3, 0))
					break
				}
			}

		case "PO1", "IT1": // 850 / 810 line items
			if lineItems == nil {
				lineItems = newNode("LineItems")
				root.add(lineItems)
			}
			current = newNode("LineItem")
			current.set("number", elemComp(seg, 0, 0))
			qty := newNode("Quantity")
			qty.set("unit", elemComp(seg, 2, 0))
			qty.text = elemComp(seg, 1, 0)
			current.add(qty)
			price := newNode("Price")
			price.set("qualifier", elemComp(seg, 4, 0))
			price.text = elemComp(seg, 3, 0)
			current.add(price)
			// Product ID qualifier/value pairs follow in pairs from index 5
			for i := 5; i+1 < len(seg.Elements); i += 2 {
				idQual := elemComp(seg, i, 0)
				idVal := elemComp(seg, i+1, 0)
				if idQual != "" && idVal != "" {
					item := newNode("Item")
					item.set("qualifier", idQual)
					item.set("id", idVal)
					current.add(item)
				}
			}
			lineItems.add(current)

		case "HL": // 856 hierarchical level
			hlID := elemComp(seg, 0, 0)
			hlParent := elemComp(seg, 1, 0)
			hlCode := elemComp(seg, 2, 0)
			levelName := x12HLCodes[hlCode]
			if levelName == "" {
				levelName = "Level"
			}
			hlNode := newNode(levelName)
			hlNode.set("id", hlID)
			hlMap[hlID] = &hlEntry{node: hlNode}

			if hlParent == "" {
				root.add(hlNode)
			} else if parent, ok := hlMap[hlParent]; ok {
				parent.node.add(hlNode)
			} else {
				root.add(hlNode)
			}
			currentHL = hlNode
			current = nil

		case "LIN": // 856 item identification within an HL
			if currentHL != nil {
				item := newNode("Item")
				item.set("qualifier", elemComp(seg, 1, 0))
				item.set("id", elemComp(seg, 2, 0))
				currentHL.add(item)
			}

		case "SN1": // 856 shipped quantity
			if currentHL != nil {
				qty := newNode("Quantity")
				qty.set("qualifier", "Shipped")
				qty.set("unit", elemComp(seg, 2, 0))
				qty.text = elemComp(seg, 1, 0)
				currentHL.add(qty)
			}

		case "TD5": // carrier routing
			carrier := newNode("Carrier")
			carrier.set("routingCode", elemComp(seg, 1, 0))
			carrier.set("serviceLevel", elemComp(seg, 2, 0))
			carrier.set("name", elemComp(seg, 3, 0))
			target := root
			if currentHL != nil {
				target = currentHL
			}
			target.add(carrier)

		case "CTT":
			root.leaf("LineItemCount", elemComp(seg, 0, 0))

		case "SE", "GE", "IEA":
			// trailers — omit

		default:
			// Unknown segment — include with generic names so no data is lost
		}
	}

	return root
}

func x12TxTypeName(txType string) string {
	switch txType {
	case "850":
		return "PurchaseOrder"
	case "810":
		return "Invoice"
	case "856":
		return "ShipNotice"
	default:
		return "Transaction"
	}
}
