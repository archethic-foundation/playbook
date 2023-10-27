import Archethic, { Crypto, Utils } from "@archethicjs/sdk"
import { requestFaucet } from "./utils.js"
import { randomBytes } from "crypto"
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

            const recipient_address = Crypto.deriveAddress(randomBytes(32))

            const tx = archethic.transaction.new()
                .setType("transfer")
                .addUCOTransfer(recipient_address, Utils.toBigInt(10))
                .build(seed)
                .originSign(originPrivateKey)

            tx
                .on("sent", () => {
                    logger.debug("UCO transaction sent")
                    logger.debug("Await validation ...")
                })
                .on("requiredConfirmation", async (_confirmations, sender) => {
                    sender.unsubscribe()

                    logger.debug(`UCO transaction created - ${Utils.uint8ArrayToHex(tx.address)}`)

                    const recipientBalance = await archethic.network.getBalance(recipient_address)
                    if (Utils.fromBigInt(recipientBalance.uco) != 10) {
                        reject(`Invalid balance for the recipient's address (${Utils.uint8ArrayToHex(recipient_address)}) after send and should be 10 UCO`)
                        return
                    }

                    const senderBalance = await archethic.network.getBalance(address)
                    if (Math.ceil(Utils.fromBigInt(senderBalance.uco)) != 90) {
                        reject(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be ~90 UCO`)
                        return
                    }

                    resolve(`${Utils.uint8ArrayToHex(recipient_address)} received 10 UCO`)
                    return

                })
                .on("error", (context, reason) => {
                    reject(`UCO transaction failed - ${reason}`)
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
    .then(logger.exit_when_flush)




