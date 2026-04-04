import { useState } from 'react'
import {
  ShellBar,
  ShellBarItem,
  TabContainer,
  Tab,
} from '@ui5/webcomponents-react'

import XMLFormatter from './pages/XMLFormatter'
import JSONFormatter from './pages/JSONFormatter'
import Converter from './pages/Converter'
import KeyGen from './pages/KeyGen'
import CertGen from './pages/CertGen'
import TestDataGen from './pages/TestDataGen'
import GroovyIDE from './pages/GroovyIDE'

type ToolTab =
  | 'xml-formatter'
  | 'json-formatter'
  | 'converter'
  | 'keygen'
  | 'certgen'
  | 'testdata'
  | 'groovy'

const TABS: { id: ToolTab; label: string }[] = [
  { id: 'xml-formatter', label: 'XML Formatter' },
  { id: 'json-formatter', label: 'JSON Formatter' },
  { id: 'converter', label: 'XML ↔ JSON' },
  { id: 'keygen', label: 'Key Generation' },
  { id: 'certgen', label: 'Certificates' },
  { id: 'testdata', label: 'Test Data' },
  { id: 'groovy', label: 'Groovy IDE' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<ToolTab>('xml-formatter')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <ShellBar
        primaryTitle="SAP CPI Toolkit"
        secondaryTitle="Developer Tools"
      >
        <ShellBarItem icon="settings" text="Settings" />
      </ShellBar>

      <TabContainer
        style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}
        onTabSelect={(e) => {
          const selected = e.detail.tab.getAttribute('data-id') as ToolTab
          if (selected) setActiveTab(selected)
        }}
      >
        {TABS.map((tab) => (
          <Tab
            key={tab.id}
            data-id={tab.id}
            text={tab.label}
            selected={activeTab === tab.id}
          />
        ))}
      </TabContainer>

      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {activeTab === 'xml-formatter' && <XMLFormatter />}
        {activeTab === 'json-formatter' && <JSONFormatter />}
        {activeTab === 'converter' && <Converter />}
        {activeTab === 'keygen' && <KeyGen />}
        {activeTab === 'certgen' && <CertGen />}
        {activeTab === 'testdata' && <TestDataGen />}
        {activeTab === 'groovy' && <GroovyIDE />}
      </div>
    </div>
  )
}
