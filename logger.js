import { createLogger, transports, format } from 'winston'
import LokiTransport from 'winston-loki'

let logger

const user = ``
const password = ``

const initializeLogger = () => {
    if (logger) {
        return
    }

    logger = createLogger({
        level: `info`,
        transports: [new LokiTransport({
            host: `https://logs-prod-eu-west-0.grafana.net`,
            basicAuth: `${user}:${password}`,
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