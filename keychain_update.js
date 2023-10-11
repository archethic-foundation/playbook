import Archethic, { Keychain, Crypto, Utils } from "@archethicjs/sdk"
import { randomBytes } from "crypto"

const originPrivateKey = Utils.originPrivateKey;
let archethic

function generateKeychainTransaction(accessPublicKey, keychain = undefined, index = 0) {
    const keychainSeed = randomBytes(32)

    if(keychain === undefined) {
        keychain = new Keychain(keychainSeed)
            .addService("uco", "m/650'/0/0")
            .addAuthorizedPublicKey(accessPublicKey)
    }

   return archethic.account.newKeychainTransaction(keychain, index)
        .originSign(originPrivateKey)
}

function generateKeychainAccessTransaction(accessSeed, keychainAddress) {
    return archethic.account
        .newAccessTransaction(accessSeed, keychainAddress)
        .originSign(originPrivateKey)
}

async function run() {

    const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
    
    archethic = new Archethic(endpoint)
    await archethic.connect()

    const accessSeed = randomBytes(32)
    const { publicKey: accessPublicKey } = Crypto.deriveKeyPair(accessSeed, 0);

    const keychainTx = generateKeychainTransaction(accessPublicKey)

    keychainTx
        .on("sent", () => {
            console.log("Keychain transaction sent")
            console.log("Await validation ...")
        })
        .on("requiredConfirmation", async (_confirmations, sender) => {
            sender.unsubscribe()

            console.log(`Keychain transaction created - ${Utils.uint8ArrayToHex(keychainTx.address)}`)

            const accessKeychainTx = generateKeychainAccessTransaction(accessSeed, keychainTx.address)

            accessKeychainTx
                .on("sent", () => {
                    console.log("Keychain access transaction sent")
                    console.log("Await validation ...")
                })
                .on("requiredConfirmation", async (confirmation, sender) => {
                    sender.unsubscribe()

                    console.log(`Keychain access transaction created - ${Utils.uint8ArrayToHex(accessKeychainTx.address)}`)

                    console.log("Keychain fetching...")
                    const keychain = await archethic.account.getKeychain(accessSeed)

                    if (new TextDecoder().decode(keychainTx.data.content) != JSON.stringify(keychain.toDID())) {
                        console.log("Keychain doesn't match")
                        process.exit(1)
                    }

                    console.log("Keychain retrieved with success")

                    keychain.addService("website", "m/650'/website/0")
                    const newKeychainTx = generateKeychainTransaction(accessPublicKey, keychain, 1)

                    newKeychainTx
                        .on("sent", () => {
                            console.log("Keychain's update transaction sent")
                            console.log("Await validation ...")
                        })
                        .on("requiredConfirmation", async (confirmation, sender) => {
                            sender.unsubscribe()
                            console.log(`Keychain's update transaction created - ${Utils.uint8ArrayToHex(newKeychainTx.address)}`)

                            console.log("Keychain fetching...")
                            const keychain = await archethic.account.getKeychain(accessSeed)

                            if (keychain.services.website === undefined) {
                                console.log(`Keychain' update doestn't match`)
                                process.exit(1)
                            }

                            console.log("Keychain updated with success")

                            process.exit(0);
                        })
                        .on("error", (context, reason) => {
                            console.log(`Keychain's update transaction failed - ${reason}`)
                            process.exit(1)
                        })
                        .send()
                })
                .on("error", (context, reason) => {
                    console.log(`Keychain accesss transaction failed - ${reason}`)
                    process.exit(1)
                })
                .send()
        })
        .on("error", (context, reason) => {
            console.log(`Keychain transaction failed - ${reason}`)
            process.exit(1)
        })
        .send()
}

run()