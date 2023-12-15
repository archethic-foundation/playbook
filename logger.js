import { createLogger, transports, format } from 'winston'
import LokiTransport from 'winston-loki'

let logger
let isAsync = false

// initiate the default transport: console
let loggerTransports = [
    new transports.Console({
        format: format.combine(format.simple(), format.colorize())
    })
]

// maybe append LOKI transport
const user = process.env.LOKI_USER
const token = process.env.LOKI_TOKEN
if (user && token) {
    isAsync = true
    loggerTransports.push(new LokiTransport({
        host: `https://logs-prod-eu-west-0.grafana.net`,
        basicAuth: `${user}:${token}`,
        labels: { job: `playbook-testnet` },
        json: true,
        format: format.json(),
        replaceTimestamp: true,
        onConnectionError: (err) => console.error(err)
    }))
}

const initializeLogger = () => {
    if (logger) return

    logger = createLogger({
        level: process.env["LOGGER_LEVEL"] || `info`,
        transports: loggerTransports
    })

    // we add a new function to the logger
    logger.exit_when_flush = async function (exitCode) {
        if (isAsync) {
            // wait 30secs to allow the logger to send the logs to Loki
            // TODO: improve
            await new Promise(r => setTimeout(r, 30_000));
        }
        process.exit(exitCode)
    }
}

export const getLogger = () => {
    initializeLogger()
    return logger
}