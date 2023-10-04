import Archethic, { Crypto, Utils } from "archethic"
import { randomBytes } from "crypto"

const originPrivateKey = Utils.originPrivateKey;

import {requestFaucet, findTokenBalance } from "./utils.js"
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
    const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
    archethic = new Archethic(endpoint)
    await archethic.connect()
    
    const seed = randomBytes(32)
    const address = Crypto.deriveAddress(seed)

    console.log("Request funds from faucet...")
    await requestFaucet(Utils.uint8ArrayToHex(address), endpoint)

    const senderBalance = await archethic.network.getBalance(address)
    if (Utils.fromBigInt(senderBalance.uco) != 100) {
        console.log(`Invalid balance for the sender's address`)
        process.exit(1)
    }

    console.log("Funds received from faucet")

    const mintTx = getMintTokenTransaction()
        .build(seed, 0)
        .originSign(originPrivateKey)

    mintTx
    .on("sent", () => {
        console.log("Token transaction sent")
        console.log("Await validation ...")
    })
    .on("requiredConfirmation", async (_confirmations, sender) => {
        sender.unsubscribe()

        console.log(`Token transaction created - ${Utils.uint8ArrayToHex(mintTx.address)}`)

        const { amount: tokenAmount, address: tokenAddress } = await findTokenBalance(archethic, address, Utils.uint8ArrayToHex(mintTx.address).toUpperCase())

        if (Utils.fromBigInt(tokenAmount) != 100) {
            console.log(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 100 token`)
            process.exit(1)
        }

        console.log("100 MKT tokens have been minted")

        const recipientAddress = Crypto.deriveAddress(randomBytes(32))

        const transferTx = getTokenTransferTransaction(recipientAddress, 20, tokenAddress)
            .build(seed, 1)
            .originSign(originPrivateKey)

        transferTx
            .on("sent", () => {
                console.log("Transfer transaction sent")
                console.log("Await validation ...")
            })
            .on("requiredConfirmation", async(_confirmations, sender) => {
                sender.unsubscribe()

                console.log(`Transfer transaction created - ${Utils.uint8ArrayToHex(transferTx.address)}`)

                const { amount: receivedTokens } = await findTokenBalance(archethic, recipientAddress, tokenAddress)
                if (Utils.fromBigInt(receivedTokens) != 20) {
                    console.log(`Invalid balance for the recipient's address (${Utils.uint8ArrayToHex(recipientAddress)}) after send and should be 20 token`)
                    process.exit(1)
                }
    
                const { amount: remainingTokens } = await findTokenBalance(archethic, Utils.uint8ArrayToHex(address), tokenAddress)
                if (Utils.fromBigInt(remainingTokens) != 80) {
                    console.log(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 80 tokens`)
                    process.exit(1)
                }

                console.log("Token transfered with success")

                process.exit(0)

            })
            .on("error", (context, reason) => {
                console.log(`Transfer transaction failed - ${reason}`)
                process.exit(1)
            })
            .send()
    })
    .on("error", (context, reason) => {
        console.log(`Token transaction failed - ${reason}`)
        process.exit(1)
    })
    .send()
}

run()