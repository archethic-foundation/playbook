import { createLogger, transports, format } from 'winston'
import LokiTransport from 'winston-loki'

let logger

const user = process.env.LOKI_USER
const token = process.env.LOKI_TOKEN

if (!user)
    throw new Error("missing env vars: LOKI_USER")

if (!token)
    throw new Error("missing env vars: LOKI_TOKEN")

const initializeLogger = () => {
    if (logger) {
        return
    }

    logger = createLogger({
        level: `info`,
        transports: [new LokiTransport({
            host: `https://logs-prod-eu-west-0.grafana.net`,
            basicAuth: `${user}:${token}`,
            labels: { job: `playbook-testnet` },
            json: true,
            format: format.json(),
            replaceTimestamp: true,
            onConnectionError: (err) => console.error(err)
        }),
        new transports.Console({
            format: format.combine(format.simple(), format.colorize())
        })]
    })
}

export const getLogger = () => {
    initializeLogger()
    return logger
}