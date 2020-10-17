const fs = require("fs")
const path = require("path")
const http = require("http")
const https = require("https")
const express = require("express")
const YAML = require('yaml')
const { spawn } = require("child_process")

let triggers = []
let tasks = [] // { id: string, status: "running" | "done" | "failed", restartOnCompletion: boolean }

function main() {
    triggers = readTriggersFile()
    const app = express()

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*')
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
        next()
    })
    app.options('*', (req, res) => {
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.send()
    })

    app.get("/:id", getTaskStatus)
    app.post("/:id", triggerTask)
    app.use((req, res) => {
        console.error(`[ERROR] trigger not found: ${req.path}`)
        res.status(404).send("Not found")
    })

    const port = process.env.PORT || 5000

    if (process.env.TLS_CERT && process.env.TLS_KEY) {
        if (!fs.existsSync(process.env.TLS_CERT)) {
            console.error("The TLS certificate file does not exist")
            process.exit(1)
        }
        if (!fs.existsSync(process.env.TLS_KEY)) {
            console.error("The TLS key file does not exist")
            process.exit(1)
        }
        https.createServer({
            key: fs.readFileSync(process.env.TLS_KEY),
            cert: fs.readFileSync(process.env.TLS_CERT),
            ca: process.env.TLS_CHAIN ? fs.readFileSync(process.env.TLS_CHAIN) : undefined
        }, app).listen(port, () => console.log("Listening on https://0.0.0.0:" + port))
    }
    else {
        http.createServer(app).listen(port, () => console.log("Listening on http://0.0.0.0:" + port))
    }
}

// EXAMPLE CALL:
// $ curl -H "Authorization: Bearer my-access-token" -X POST http://localhost:5000/my-trigger-prod

async function triggerTask(req, res, next) {
    try {
        if (!req.params.id || !req.get("Authorization")) return next()

        const bearerToken = req.get("Authorization")
        if (!bearerToken.startsWith("Bearer ")) return next()
        const token = bearerToken.substr(7)

        const trigger = triggers.find(trigger => trigger.id === req.params.id)
        if (!trigger) return next()
        else if (trigger.token.trim() !== token.trim()) {
            console.error("[ERROR] Invalid request for", req.params.id, "with", token)
            res.status(404).send("Not found")
            return
        }

        res.send(spawnTask(trigger))
    } catch (err) {
        console.error("[ERROR]", err)
        res.status(404).send("Not found")
    }
}

function getTaskStatus(req, res, next) {
    if (!req.params.id || !req.get("Authorization")) return next()

    const bearerToken = req.get("Authorization")
    if (!bearerToken.startsWith("Bearer ")) return next()
    const token = bearerToken.substr(7)

    const trigger = triggers.find(trigger => trigger.id === req.params.id)
    if (!trigger) return next()
    else if (trigger.token.trim() !== token.trim()) {
        console.error("[ERROR] Invalid request for", req.params.id, "with", token)
        res.status(404).send("Not found")
        return
    }

    // Already running?
    const idx = tasks.findIndex(task => task.id == trigger.id)
    if (idx >= 0) {
        res.send({ id: tasks[idx].id, status: tasks[idx].status })
    } else {
        res.send({ id: req.params.id, status: "unstarted" })
    }
}

function readTriggersFile() {
    let configFile = process.argv[2] || process.env.TRIGGERS_FILE || "./triggers.yaml"
    if (!fs.existsSync) {
        console.error("Error: The config file", configFile, "does not exist.")
        console.error("Error: You can pass it as the first argument, set TRIGGERS_FILE environment variable or create it locally")
        process.exit(1)
    }
    console.log("Using", configFile, "as the config file")

    try {
        const buff = fs.readFileSync(configFile)
        const parsedData = YAML.parse(buff.toString())
        if (typeof parsedData != "object") throw new Error("NOT OBJECT: " + parsedData)

        const { triggers } = parsedData
        if (!Array.isArray(triggers)) throw new Error()

        for (let trigger of triggers) {
            if (typeof trigger !== "object") throw new Error("Invalid trigger entry: " + trigger)
            else if (!trigger.id || typeof trigger.id != "string") throw new Error("The 'id' field must be a string: " + trigger.id)
            else if (!trigger.token || typeof trigger.token != "string") throw new Error("The 'token' field must be a string: " + trigger.token)
            else if (!trigger.script || typeof trigger.script != "string") throw new Error("The 'script' field must be a string: " + trigger.script)
            fs.accessSync(trigger.script, fs.constants.X_OK) // throws if error
        }
        return triggers
    } catch (err) {
        console.error(err || "Error: The triggers file does not contain valid YAML data")
        process.exit(1)
    }
}

function spawnTask(trigger) { // returns string
    // Already running?
    const idx = tasks.findIndex(task => task.id == trigger.id)
    if (idx >= 0 && tasks[idx].status == "running") {
        tasks[idx].restartOnCompletion = true
        console.warn(`[${trigger.id}]  Attempting to trigger the action while active. Will restart when done.`)
        return "Already running, will restart when completed"
    }
    else if (idx < 0) {
        tasks.push({ id: trigger.id, status: "running", restartOnCompletion: false })
    } else {
        tasks[idx].status = "running"
    }

    fs.accessSync(trigger.script, fs.constants.X_OK) // throws if not executable

    console.log(`[${trigger.id}]  Starting ${trigger.script}`)

    const child = spawn(trigger.script, {
        cwd: path.dirname(trigger.script)
    })
    child.stdout.on('data', function (data) {
        console.log(`[${trigger.id}]  ${data.toString()}`)
    })
    child.stderr.on('data', function (data) {
        console.error(`[${trigger.id}]  ${data.toString()}`)
    })
    child.on('close', code => {
        const idx = tasks.findIndex(task => task.id == trigger.id)
        if (idx >= 0) tasks[idx].status = (code == 0) ? "done" : "failed"

        if (tasks[idx].restartOnCompletion) {
            setTimeout(() => spawnTask(trigger), 1000)
            tasks[idx].restartOnCompletion = false
        }

        console.log(`[${trigger.id}]  DONE (status ${code})\n`)
    })

    return "OK"
}

main()
