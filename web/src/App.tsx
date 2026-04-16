import React, { useState, useCallback } from 'react'
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
import LookupTables from './pages/LookupTables'
import GroovyIDE from './pages/GroovyIDE'
import EDITools from './pages/EDITools'
import ScriptLibrary from './pages/ScriptLibrary'
import HttpClient from './pages/HttpClient'
import MockService from './pages/MockService'
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
  | 'http-client'
  | 'mock'
  | 'sftp'
  | 'assets'
  | 'lookup-tables'

const GROUPS: { label: string; tabs: { id: ToolTab; label: string }[] }[] = [
  {
    label: 'HTTP Client',
    tabs: [
      { id: 'http-client', label: 'HTTP Client' },
    ],
  },
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
    label: 'Generator',
    tabs: [
      { id: 'testdata',      label: 'Test Data'      },
      { id: 'lookup-tables', label: 'Lookup Tables'  },
    ],
  },
  {
    label: 'Keys & Certs',
    tabs: [
      { id: 'keygen',  label: 'Key Generation' },
      { id: 'certgen', label: 'Certificates'   },
    ],
  },
  {
    label: 'Utilities',
    tabs: [
      { id: 'mock',   label: 'Mock Service' },
      { id: 'sftp',   label: 'SFTP Server'  },
      { id: 'assets', label: 'Asset Store'  },
    ],
  },
  {
    label: 'Groovy',
    tabs: [
      { id: 'groovy',  label: 'Groovy IDE'     },
      { id: 'library', label: 'Script Library' },
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
        {GROUPS.map((group) =>
          group.tabs.length === 1 ? (
            <Tab
              key={group.label}
              data-id={group.tabs[0].id}
              text={group.label}
              selected={activeTab === group.tabs[0].id}
            />
          ) : (
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
          )
        )}
      </TabContainer>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--sapBackgroundColor)', position: 'relative' }}>
        {([
          ['xml-formatter',  <XMLFormatter />],
          ['json-formatter', <JSONFormatter />],
          ['xsd-generator',  <XSDGenerator />],
          ['converter',      <Converter />],
          ['keygen',         <KeyGen />],
          ['certgen',        <CertGen />],
          ['testdata',       <TestDataGen />],
          ['lookup-tables',  <LookupTables />],
          ['groovy',         <GroovyIDE inject={ideInject} />],
          ['edi',            <EDITools />],
          ['library',        <ScriptLibrary onLoadInIDE={loadInIDE} />],
          ['http-client',    <HttpClient />],
          ['mock',           <MockService />],
          ['sftp',           <SFTPServer />],
        ] as [ToolTab, React.ReactNode][]).map(([id, node]) => (
          <div
            key={id}
            style={{
              display:  activeTab === id ? 'block' : 'none',
              padding:  '1rem',
              height:   '100%',
              boxSizing: 'border-box',
            }}
          >
            {node}
          </div>
        ))}
        {activeTab === 'assets' && (
          <div style={{ padding: '1rem', height: '100%', boxSizing: 'border-box' }}>
            <AssetStore />
          </div>
        )}
      </div>
    </FlexBox>
  )
}
