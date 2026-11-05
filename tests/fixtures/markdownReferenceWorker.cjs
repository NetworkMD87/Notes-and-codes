const { parentPort } = require('node:worker_threads')
const MarkdownIt = require('markdown-it')

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
// The advisory is in block/reference, before inline parsing or sanitization.
// Isolate that stage so hundreds of thousands of <br> DOM nodes do not turn
// this regression into an unrelated large-preview memory/performance test.
parentPort.on('message', source => {
  const env = {}
  const tokens = []
  md.block.parse(source, md, env, tokens)
  parentPort.postMessage({
    heading: tokens.some((token, index) => token.type === 'heading_open' && tokens[index + 1]?.content === 'Recovered'),
    href: env.references?.OK?.href,
    textLength: tokens.filter(token => token.type === 'inline').reduce((length, token) => length + token.content.length, 0),
  })
})
parentPort.postMessage('ready')
