import Archethic, { Crypto, Utils } from "@archethicjs/sdk"
import { randomBytes } from "crypto"
import { requestFaucet, findTokenBalance } from "./utils.js"
import { getLogger } from "./logger.js"

const logger = getLogger()
const originPrivateKey = Utils.originPrivateKey;

let archethic

function getMintTokenTransaction() {
    return archethic.transaction.new()
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
}

function getTokenTransferTransaction(recipient_address, amount, tokenAddress) {
    return archethic.transaction.new()
        .setType("transfer")
        .addTokenTransfer(recipient_address, Utils.toBigInt(amount), tokenAddress)
}

async function run() {
    return new Promise(async function (resolve, reject) {
        try {
            const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
            archethic = new Archethic(endpoint)
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

            const mintTx = getMintTokenTransaction()
                .build(seed, 0)
                .originSign(originPrivateKey)

            mintTx
                .on("sent", () => {
                    logger.debug("Token transaction sent")
                    logger.debug("Await validation ...")
                })
                .on("requiredConfirmation", async (_confirmations, sender) => {
                    sender.unsubscribe()

                    logger.debug(`Token transaction created - ${Utils.uint8ArrayToHex(mintTx.address)}`)

                    const { amount: tokenAmount, address: tokenAddress } = await findTokenBalance(archethic, address, Utils.uint8ArrayToHex(mintTx.address).toUpperCase())

                    if (Utils.fromBigInt(tokenAmount) != 100) {
                        reject(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 100 token`)
                        return
                    }

                    logger.debug("100 MKT tokens have been minted")

                    const recipientAddress = Crypto.deriveAddress(randomBytes(32))

                    const transferTx = getTokenTransferTransaction(recipientAddress, 20, tokenAddress)
                        .build(seed, 1)
                        .originSign(originPrivateKey)

                    transferTx
                        .on("sent", () => {
                            logger.debug("Transfer transaction sent")
                            logger.debug("Await validation ...")
                        })
                        .on("requiredConfirmation", async (_confirmations, sender) => {
                            sender.unsubscribe()

                            logger.debug(`Transfer transaction created - ${Utils.uint8ArrayToHex(transferTx.address)}`)

                            const { amount: receivedTokens } = await findTokenBalance(archethic, recipientAddress, tokenAddress)
                            if (Utils.fromBigInt(receivedTokens) != 20) {
                                reject(`Invalid balance for the recipient's address (${Utils.uint8ArrayToHex(recipientAddress)}) after send and should be 20 token`)
                                return
                            }

                            const { amount: remainingTokens } = await findTokenBalance(archethic, Utils.uint8ArrayToHex(address), tokenAddress)
                            if (Utils.fromBigInt(remainingTokens) != 80) {
                                reject(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 80 tokens`)
                                return
                            }

                            resolve("Token transfered with success")
                            return

                        })
                        .on("error", (context, reason) => {
                            reject(`Transfer transaction failed - ${reason}`)
                            return
                        })
                        .send()
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