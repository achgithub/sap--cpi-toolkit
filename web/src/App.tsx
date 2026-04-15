import { useState, useCallback } from 'react'
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
import ScriptLibrary from './pages/ScriptLibrary'
import SFTPServer from './pages/SFTPServer'
import AssetStore from './pages/AssetStore'
import { type SampleInput } from './data/scriptLibrary'

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
  | 'library'
  | 'sftp'
  | 'assets'

const GROUPS: { label: string; tabs: { id: ToolTab; label: string }[] }[] = [
  {
    label: 'Format & Convert',
    tabs: [
      { id: 'xml-formatter',  label: 'XML Formatter'  },
      { id: 'json-formatter', label: 'JSON Formatter' },
      { id: 'converter',      label: 'XML ↔ JSON'     },
      { id: 'xsd-generator',  label: 'XSD Generator'  },
      { id: 'edi',            label: 'EDI Tools'      },
    ],
  },
  {
    label: 'Groovy',
    tabs: [
      { id: 'groovy',  label: 'Groovy IDE'     },
      { id: 'library', label: 'Script Library' },
    ],
  },
  {
    label: 'Testing',
    tabs: [
      { id: 'testdata', label: 'Test Data'      },
      { id: 'keygen',   label: 'Key Generation' },
      { id: 'certgen',  label: 'Certificates'   },
      { id: 'sftp',     label: 'SFTP Server'    },
      { id: 'assets',            label: 'Asset Store'    },
    ],
  },
]

export default function App() {
  const [activeTab,    setActiveTab]    = useState<ToolTab>('xml-formatter')
  const [ideInject,    setIdeInject]    = useState<{ body: string; sample?: SampleInput; key: number } | undefined>()

  const loadInIDE = useCallback((body: string, sample?: SampleInput) => {
    setIdeInject(prev => ({ body, sample, key: (prev?.key ?? 0) + 1 }))
    setActiveTab('groovy')
  }, [])

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
        {GROUPS.map((group) => (
          <Tab
            key={group.label}
            text={group.label}
            items={group.tabs.map((tab) => (
              <Tab
                key={tab.id}
                data-id={tab.id}
                text={tab.label}
                selected={activeTab === tab.id}
              />
            ))}
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
        {activeTab === 'groovy'         && <GroovyIDE inject={ideInject} />}
        {activeTab === 'edi'                && <EDITools />}
        {activeTab === 'library'            && <ScriptLibrary onLoadInIDE={loadInIDE} />}
        {activeTab === 'sftp'    && <SFTPServer />}
        {activeTab === 'assets'             && <AssetStore />}
      </div>
    </FlexBox>
  )
}
