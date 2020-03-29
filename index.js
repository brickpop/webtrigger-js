const fs = require("fs")
const path = require("path")
const express = require("express")
const YAML = require('yaml')
const { spawn } = require("child_process")

let triggers = []

function main() {
    triggers = readTriggersFile()
    const app = express()

    app.post("/:id", handleRequest)
    app.use((req, res) => {
        console.error(`[ERROR] trigger not found: ${req.path}`)
        res.status(404).send("Not found")
    })

    const port = process.env.PORT || 5000
    console.log("Listening to port", port)
    app.listen(port)
}

// EXAMPLE CALL:
// $ curl -H "Authorization: Bearer my-access-token" -X POST http://localhost:5000/my-trigger-prod

async function handleRequest(req, res, next) {
    try {
        if (!req.params.id || !req.get("Authorization")) return next()

        const bearerToken = req.get("Authorization")
        if (!bearerToken.startsWith("Bearer ")) return next()
        const token = bearerToken.substr(7)

        const trigger = triggers.find(s => s.id === req.params.id)
        if (!trigger) return next()
        else if (trigger.token.trim() !== token.trim()) {
            console.error("[ERROR] Invalid request for", req.params.id, "with", token)
            res.status(404).send("Not found")
            return
        }

        fs.accessSync(trigger.script, fs.constants.X_OK) // throws if not executable

        console.log(`[${trigger.id}]  Starting ${trigger.script}`)

        const child = spawn(trigger.script, {
            cwd: path.dirname(trigger.script)
        })
        child.stdout.on('data', function (data) {
            console.log(`[${trigger.id}]  ${data.toString()}`);
        })
        child.stderr.on('data', function (data) {
            console.log(`[${trigger.id}]  ${data.toString()}`);
        })
        child.on('close', code => {
            console.log(`[${trigger.id}]  DONE (status ${code})\n`)
        })

        res.send("OK")
    } catch (err) {
        console.error("[ERROR]", err)
        res.status(404).send("Not found")
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

main()
