import Archethic, { Crypto, Utils } from "archethic"

import { randomBytes } from "crypto"
import {requestFaucet } from "./utils.js"

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
    const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
    
    archethic = new Archethic(endpoint)
    await archethic.connect()

    const contractSeed = randomBytes(32)
    const contractAddress = Crypto.deriveAddress(contractSeed)

    const callerSeed = randomBytes(32)
    const callerAddress = Crypto.deriveAddress(callerSeed)

    console.log("Request funds from faucet...")
    await requestFaucet(Utils.uint8ArrayToHex(contractAddress), endpoint)
    await requestFaucet(Utils.uint8ArrayToHex(callerAddress), endpoint)

    const contractBalance = await archethic.network.getBalance(contractAddress)
    if (Utils.fromBigInt(contractBalance.uco) != 100) {
        console.log(`Invalid balance for the contract's address`)
        process.exit(1)
    }

    const callerBalance = await archethic.network.getBalance(callerAddress)
    if (Utils.fromBigInt(callerBalance.uco) != 100) {
        console.log(`Invalid balance for the caller's address`)
        process.exit(1)
    }

    const contractTx = await getContractTransaction(contractSeed)

    contractTx
        .on("sent", () => {
            console.log("Contract transaction sent")
            console.log("Await validation ...")
        })
        .on("error", (context, reason) => {
            console.log(`Contract transaction failed - ${reason}`)
            process.exit(1)
        })
        .on("requiredConfirmation", (confirmations, sender) => {
            sender.unsubscribe()

            console.log(`Contract transaction created - ${Utils.uint8ArrayToHex(contractTx.address)}`)

            const callTx = getCallTransaction(contractTx.address, callerSeed)

            callTx
                .on("sent", () => {
                    console.log("Contract's call transaction sent")
                    console.log("Await validation ...")
                })
                .on("error", (context, reason) => {
                    console.log(`Contract's call transaction failed - ${reason}`)
                    process.exit(1)
                })
                .on("requiredConfirmation", async (confirmations, sender) => {
                    sender.unsubscribe()

                    console.log(`Contract's call transaction created - ${Utils.uint8ArrayToHex(callTx.address)}`)

                    await new Promise(r => setTimeout(r, 2000));

                    const { lastTransaction: { data: { content: lastContent }}} = await archethic.network.rawGraphQLQuery(`
                    query
                    {
                      lastTransaction(address: "${Utils.uint8ArrayToHex(contractTx.address)}") {
                        data {
                            content
                        }
                      }
                    }`)
                    
                    if (lastContent != "Contract executed") {
                        console.log(`Contract self trigger transaction not executed`)
                        process.exit(1)
                    }

                    console.log("Contract's call transaction executed with success")

                    process.exit(0)
                })
                .send()
        })
        .send()
}

run()
