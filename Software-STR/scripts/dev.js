import { spawn } from 'node:child_process'

const processes = [
  ['api', 'node', ['server/index.js']],
  ['web', 'node', ['node_modules/vite/bin/vite.js']],
]

const children = processes.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} process exited with code ${code}.`)
    }
  })

  return child
})

function stopProcesses() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', stopProcesses)
process.on('SIGTERM', stopProcesses)
