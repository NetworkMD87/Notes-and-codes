import './monacoEnv'
import type { Api } from '../shared/types'
import { EditorPane } from './editorPane'
import { BufferManager } from './bufferManager'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const paneA = new EditorPane(document.getElementById('paneA')!)
const first = manager.create()
paneA.setBuffer(first)
paneA.onChange(c => manager.update(manager.activeId!, c))
