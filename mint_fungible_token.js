import Archethic, { Crypto, Utils } from "@archethicjs/sdk"
import { randomBytes } from "crypto"
import { requestFaucet } from "./utils.js"
import { getLogger } from "./logger.js"

const logger = getLogger()
const originPrivateKey = Utils.originPrivateKey;


async function run() {

    return new Promise(async function (resolve, reject) {
        try {
            const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
            const archethic = new Archethic(endpoint)
            await archethic.connect()

            const seed = randomBytes(32)
            const address = Crypto.deriveAddress(seed)

            logger.debug("Request funds from faucet...")

            await requestFaucet(Utils.uint8ArrayToHex(address), endpoint)


            const senderBalance = await archethic.network.getBalance(address)
            if (Utils.fromBigInt(senderBalance.uco) != 100) {
                reject(`Invalid balance for the sender's address`)
                return
            }

            logger.debug("Funds received from faucet")

            const tx = archethic.transaction.new()
                .setType("token")
                .setContent(JSON.stringify({
                    supply: Utils.toBigInt(100),
                    name: "MyToken",
                    type: "fungible",
                    symbol: "MTK",
                    properties: {
                        description: "This is token used to test token creation"
                    }
                }))
                .build(seed)
                .originSign(originPrivateKey)


            tx
                .on("sent", () => {
                    logger.debug("Token transaction sent")
                    logger.debug("Await validation ...")
                })
                .on("requiredConfirmation", async (_confirmations, sender) => {
                    sender.unsubscribe()

                    logger.debug(`Token transaction created - ${Utils.uint8ArrayToHex(tx.address)}`)

                    const senderBalance = await archethic.network.getBalance(address)

                    const { amount: tokenAmount } = senderBalance.token.find(x => {
                        return x.address.toLowerCase() == Utils.uint8ArrayToHex(tx.address)
                    })

                    if (Utils.fromBigInt(tokenAmount) != 100) {
                        reject(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 100 token`)
                        return
                    }

                    resolve("100 MKT tokens have been minted")
                    return

                })
                .on("error", (context, reason) => {
                    reject(`Token transaction failed - ${reason}`)
                    return
                })
                .send()
        } catch (e) {
            reject(e)
            return
        }
    })

}

run()
    .then((msg) => {
        logger.info(msg)
        return 0
    })
    .catch((msg) => {
        logger.error(msg)
        return 1
    })
    .then(async (exitCode) => {
        // wait 30secs after the run is done
        // to allow the logger to send the logs to Loki
        await new Promise(r => setTimeout(r, 30_000));
        process.exit(exitCode)
    })