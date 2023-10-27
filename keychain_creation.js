import Archethic, { Keychain, Crypto, Utils } from "@archethicjs/sdk"
import { randomBytes } from "crypto"
import { getLogger } from "./logger.js"

const logger = getLogger()
const originPrivateKey = Utils.originPrivateKey;
let archethic

function generateKeychainTransaction(accessPublicKey) {
    const keychainSeed = randomBytes(32)

    const keychain = new Keychain(keychainSeed)
        .addService("uco", "m/650'/0/0")
        .addAuthorizedPublicKey(accessPublicKey)

    return archethic.account.newKeychainTransaction(keychain, 0)
        .originSign(originPrivateKey)
}

function generateKeychainAccessTransaction(accessSeed, keychainAddress) {
    return archethic.account
        .newAccessTransaction(accessSeed, keychainAddress)
        .originSign(originPrivateKey)
}

async function run() {

    return new Promise(async function (resolve, reject) {
        try {
            const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"

            archethic = new Archethic(endpoint)
            await archethic.connect()

            const accessSeed = randomBytes(32)
            const { publicKey: accessPublicKey } = Crypto.deriveKeyPair(accessSeed, 0);

            const keychainTx = generateKeychainTransaction(accessPublicKey)

            keychainTx
                .on("sent", () => {
                    logger.debug("Keychain transaction sent")
                    logger.debug("Await validation ...")
                })
                .on("requiredConfirmation", async (_confirmations, sender) => {
                    sender.unsubscribe()

                    logger.debug(`Keychain transaction created - ${Utils.uint8ArrayToHex(keychainTx.address)}`)

                    const accessKeychainTx = generateKeychainAccessTransaction(accessSeed, keychainTx.address)

                    accessKeychainTx
                        .on("sent", () => {
                            logger.debug("Keychain access transaction sent")
                            logger.debug("Await validation ...")
                        })
                        .on("requiredConfirmation", async (confirmation, sender) => {
                            sender.unsubscribe()

                            logger.debug(`Keychain access transaction created - ${Utils.uint8ArrayToHex(accessKeychainTx.address)}`)

                            logger.debug("Keychain fetching...")
                            const keychain = await archethic.account.getKeychain(accessSeed)

                            if (new TextDecoder().decode(keychainTx.data.content) != JSON.stringify(keychain.toDID())) {
                                reject("Keychain doesn't match")
                                return
                            }

                            resolve("Keychain retrieved with success")
                            return
                        })
                        .on("error", (context, reason) => {
                            reject(`Keychain accesss transaction failed - ${reason}`)
                            return
                        })
                        .send()
                })
                .on("error", (context, reason) => {
                    reject(`Keychain transaction failed - ${reason}`)
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