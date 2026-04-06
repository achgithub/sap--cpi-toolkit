import { useState } from 'react'
import {
  ShellBar,
  ShellBarItem,
  TabContainer,
  Tab,
  FlexBox,
  FlexBoxDirection,
} from '@ui5/webcomponents-react'

import XMLFormatter from './pages/XMLFormatter'
import JSONFormatter from './pages/JSONFormatter'
import XSDGenerator from './pages/XSDGenerator'
import Converter from './pages/Converter'
import KeyGen from './pages/KeyGen'
import CertGen from './pages/CertGen'
import TestDataGen from './pages/TestDataGen'
import GroovyIDE from './pages/GroovyIDE'
import EDITools from './pages/EDITools'

type ToolTab =
  | 'xml-formatter'
  | 'json-formatter'
  | 'xsd-generator'
  | 'converter'
  | 'keygen'
  | 'certgen'
  | 'testdata'
  | 'groovy'
  | 'edi'

const TABS: { id: ToolTab; label: string; icon: string }[] = [
  { id: 'xml-formatter',  label: 'XML Formatter',  icon: 'syntax'        },
  { id: 'json-formatter', label: 'JSON Formatter', icon: 'syntax'        },
  { id: 'xsd-generator',  label: 'XSD Generator',  icon: 'document-text' },
  { id: 'converter',      label: 'XML ↔ JSON',     icon: 'transfer'      },
  { id: 'keygen',         label: 'Key Generation', icon: 'key'           },
  { id: 'certgen',        label: 'Certificates',   icon: 'certificate'   },
  { id: 'testdata',       label: 'Test Data',      icon: 'simulate'      },
  { id: 'groovy',         label: 'Groovy IDE',     icon: 'terminal'      },
  { id: 'edi',            label: 'EDI Tools',      icon: 'curriculum'    },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<ToolTab>('xml-formatter')

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ height: '100vh', overflow: 'hidden' }}>
      <ShellBar
        primaryTitle="SAP CPI Toolkit"
        secondaryTitle="Developer Tools"
        logo={<img alt="SAP" src="https://www.sap.com/dam/application/shared/logos/sap-logo-svg.svg" style={{ height: '1.5rem' }} />}
      >
        <ShellBarItem icon="settings" text="Settings" />
      </ShellBar>

      <TabContainer
        onTabSelect={(e) => {
          const id = (e.detail.tab as HTMLElement).dataset.id as ToolTab
          if (id) setActiveTab(id)
        }}
        style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}
      >
        {TABS.map((tab) => (
          <Tab
            key={tab.id}
            data-id={tab.id}
            text={tab.label}
            icon={tab.icon}
            selected={activeTab === tab.id}
          />
        ))}
      </TabContainer>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem', background: 'var(--sapBackgroundColor)' }}>
        {activeTab === 'xml-formatter'  && <XMLFormatter />}
        {activeTab === 'json-formatter' && <JSONFormatter />}
        {activeTab === 'xsd-generator'  && <XSDGenerator />}
        {activeTab === 'converter'      && <Converter />}
        {activeTab === 'keygen'         && <KeyGen />}
        {activeTab === 'certgen'        && <CertGen />}
        {activeTab === 'testdata'       && <TestDataGen />}
        {activeTab === 'groovy'         && <GroovyIDE />}
        {activeTab === 'edi'            && <EDITools />}
      </div>
    </FlexBox>
  )
}
