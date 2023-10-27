import Archethic, { Crypto, Utils } from "@archethicjs/sdk"

import { randomBytes } from "crypto"
import { requestFaucet } from "./utils.js"
import { getLogger } from "./logger.js"

const logger = getLogger()
const originPrivateKey = Utils.originPrivateKey
let archethic

function contractCode() {
    return `@version 1

condition triggered_by: transaction, on: exec(), as: [
  content: Crypto.hash(contract.code)
]

actions triggered_by: transaction, on: exec() do
  Contract.set_content "Contract executed"
end`
}

async function getContractTransaction(seed) {
    const secretKey = Crypto.randomSecretKey();
    const cipher = Crypto.aesEncrypt(seed, secretKey);

    const storageNoncePublicKey = await archethic.network.getStorageNoncePublicKey()

    const encryptedSecretKey = Crypto.ecEncrypt(secretKey, storageNoncePublicKey);
    const authorizedKeys = [
        {
            publicKey: storageNoncePublicKey,
            encryptedSecretKey: encryptedSecretKey,
        }
    ]

    return archethic.transaction.new()
        .setType("contract")
        .setCode(contractCode())
        .addOwnership(cipher, authorizedKeys)
        .build(seed, 0)
        .originSign(originPrivateKey)
}

function getCallTransaction(contractAddress, callerSeed) {
    const hashCode = Utils.uint8ArrayToHex(Crypto.hash(contractCode()))

    return archethic.transaction.new()
        .setType("transfer")
        .setContent(hashCode.toUpperCase().slice(2))
        .addRecipient(contractAddress, "exec")
        .build(callerSeed, 0)
        .originSign(originPrivateKey)
}

async function run() {
    return new Promise(async function (resolve, reject) {
        try {
            const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"

            archethic = new Archethic(endpoint)
            await archethic.connect()

            const contractSeed = randomBytes(32)
            const contractAddress = Crypto.deriveAddress(contractSeed)

            const callerSeed = randomBytes(32)
            const callerAddress = Crypto.deriveAddress(callerSeed)

            logger.debug("Request funds from faucet...")

            await requestFaucet(Utils.uint8ArrayToHex(contractAddress), endpoint)
            await requestFaucet(Utils.uint8ArrayToHex(callerAddress), endpoint)


            const contractBalance = await archethic.network.getBalance(contractAddress)
            if (Utils.fromBigInt(contractBalance.uco) != 100) {
                reject(`Invalid balance for the contract's address`)
                return
            }

            const callerBalance = await archethic.network.getBalance(callerAddress)
            if (Utils.fromBigInt(callerBalance.uco) != 100) {
                reject(`Invalid balance for the caller's address`)
                return
            }

            const contractTx = await getContractTransaction(contractSeed)

            contractTx
                .on("sent", () => {
                    logger.debug("Contract transaction sent")
                    logger.debug("Await validation ...")
                })
                .on("error", (context, reason) => {
                    reject(`Contract transaction failed - ${reason}`)
                    return
                })
                .on("requiredConfirmation", (confirmations, sender) => {
                    sender.unsubscribe()

                    logger.debug(`Contract transaction created - ${Utils.uint8ArrayToHex(contractTx.address)}`)

                    const callTx = getCallTransaction(contractTx.address, callerSeed)

                    callTx
                        .on("sent", () => {
                            logger.debug("Contract's call transaction sent")
                            logger.debug("Await validation ...")
                        })
                        .on("error", (context, reason) => {
                            reject(`Contract's call transaction failed - ${reason}`)
                            return
                        })
                        .on("requiredConfirmation", async (confirmations, sender) => {
                            sender.unsubscribe()

                            logger.debug(`Contract's call transaction created - ${Utils.uint8ArrayToHex(callTx.address)}`)

                            await new Promise(r => setTimeout(r, 2000));

                            const { lastTransaction: { data: { content: lastContent } } } = await archethic.network.rawGraphQLQuery(`
                    query
                    {
                      lastTransaction(address: "${Utils.uint8ArrayToHex(contractTx.address)}") {
                        data {
                            content
                        }
                      }
                    }`)

                            if (lastContent != "Contract executed") {
                                reject(`Contract self trigger transaction not executed`)
                                return
                            }

                            resolve("Contract's call transaction executed with success")
                            return
                        })
                        .send()
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



