import Archethic, { Crypto, Utils } from "@archethicjs/sdk"
import AEWeb from '@archethicjs/aeweb-cli';
import fs from "fs"
import path from "path"
import * as glob from "glob"
import parse from "parse-gitignore"

import { randomBytes } from "crypto"
import {requestFaucet } from "./utils.js"

const originPrivateKey = Utils.originPrivateKey;

async function run() {
    const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
    const websitePath = process.env["WEBSITE_PATH"] || "./website_example"
    
    const archethic = new Archethic(endpoint)
    await archethic.connect()

    const baseSeed = Utils.uint8ArrayToHex(randomBytes(32))

    const aeweb = new AEWeb(archethic)

    const baseAddress = Crypto.deriveAddress(baseSeed, 0)

    const { refSeed: refSeed, filesSeed: filesSeed } = getSeeds(baseSeed)
    const refAddress = Crypto.deriveAddress(refSeed, 0)
    const filesAddress = Crypto.deriveAddress(filesSeed, 0)

    await requestFaucet(Utils.uint8ArrayToHex(baseAddress), endpoint)

    const normalizedPath = path.normalize(websitePath.endsWith(path.sep) ? folderPath.slice(0, -1) : websitePath)
    const files = getFiles(normalizedPath)
    if (files.length === 0) {
      throw 'folder "' + path.basename(websitePath) + '" is empty'
    }

    files.forEach(({ filePath, data }) => aeweb.addFile(filePath, data))

    let filesIndex = 0
    console.log('Creating transactions ...')

    console.log('Building files transactions...')
    const transactions = aeweb.getFilesTransactions().map(tx => {
      const index = filesIndex
      filesIndex++

      return tx
        .build(filesSeed, index)
        .originSign(originPrivateKey)
    })

    console.log('Building reference transaction...')
    const refTx = await aeweb.getRefTransaction(transactions)
    refTx
      .build(refSeed, 0)
      .originSign(originPrivateKey)

    transactions.push(refTx)

    const { refTxFees, filesTxFees } = await estimateTxsFees(archethic, transactions)

    console.log("Create funding transaction...")

    const transferTx = archethic.transaction.new()
      .setType('transfer')
      .addUCOTransfer(refAddress, refTxFees)
      .addUCOTransfer(filesAddress, filesTxFees)
      .build(baseSeed, 0)
      .originSign(originPrivateKey)

    transactions.unshift(transferTx)

    console.log('Sending ' + transactions.length + ' transactions...')

    await sendTransactions(transactions, 0, endpoint)
    console.log(`Website is deployed at: ${endpoint}/api/web_hosting/${Utils.uint8ArrayToHex(refAddress)}/`)
    process.exit(0)
}

function getSeeds(baseSeed) {
  return {
    refSeed: baseSeed + 'aeweb_ref',
    filesSeed: baseSeed + 'aeweb_files'
  }
}

function getFiles(folderPath, includeGitIgnoredFiles = false) {
  let files = []
  const filters = []
  if (fs.statSync(folderPath).isDirectory()) {
    handleDirectory(folderPath, files, includeGitIgnoredFiles, filters)

    files = files.map((file) => {
      file.filePath = file.filePath.replace(folderPath, '')
      return file
    })
  } else {
    const data = fs.readFileSync(folderPath)
    const filePath = path.basename(folderPath)
    files.push({ filePath, data })
  }

  return files
}

async function estimateTxsFees(archethic, transactions) {
  const slippage = 1.01

  let transactionsFees = transactions.map(tx => {
    return new Promise(async (resolve, _reject) => {
      const { fee } = await archethic.transaction.getTransactionFee(tx)
      resolve(fee)
    })
  })

  transactionsFees = await Promise.all(transactionsFees)

  // Last transaction of the list is the reference transaction
  const fee = transactionsFees.pop()
  const refTxFees = Math.trunc(fee * slippage)

  let filesTxFees = transactionsFees.reduce((total, fee) => total += fee, 0)
  filesTxFees = Math.trunc(filesTxFees * slippage)

  return { refTxFees, filesTxFees }
}

function handleDirectory(folderPath, files, includeGitIgnoredFiles, filters) {
  if (!includeGitIgnoredFiles) {
    filters = getFilters(folderPath, filters)
  }

  // Check if files is filtered
  if (!filters.includes(folderPath)) {
    // reduce search space by omitting folders at once
    if (fs.statSync(folderPath).isDirectory()) {
      fs.readdirSync(folderPath).forEach((child) => {
        handleDirectory(path.join(folderPath, child), files, includeGitIgnoredFiles, filters)
      })
    } else {
      handleFile(folderPath, files);
    }
  }
}

function handleFile(filePath, files) {
  const data = fs.readFileSync(filePath)
  files.push({ filePath, data })
}

function getFilters(folderPath, filters) {
  let newFilters = []

  const gitIgnoreFilePath = path.join(folderPath, '.gitignore')
  if (fs.existsSync(gitIgnoreFilePath)) {
    console.log('Ignore files from: ' + gitIgnoreFilePath)
    newFilters = parse(fs.readFileSync(gitIgnoreFilePath))['patterns']
    newFilters.unshift('.gitignore')
    newFilters.unshift('.git')
  }

  // Add the new filters to the previous filters
  return newFilters.reduce((acc, path) => {
    return acc.concat(glob.sync(PathLib.join(folderPath, path)))
  }, filters)
}

async function sendTransactions(transactions, index, endpoint) {
  return new Promise(async (resolve, reject) => {
    console.log('Transaction ' + (index + 1) + '...')
    const tx = transactions[index]

    tx
      .on('requiredConfirmation', async (nbConf) => {
        console.log('Transaction confirmed !')
        console.log('See transaction in explorer:', endpoint + '/explorer/transaction/' + Utils.uint8ArrayToHex(tx.address))
        console.log('-----------')

        if (index + 1 == transactions.length) {
          resolve()
        } else {
          sendTransactions(transactions, index + 1, endpoint)
            .then(() => resolve())
            .catch(error => reject(error))
        }
      })
      .on('error', (context, reason) => reject(reason))
      .on('timeout', (nbConf) => reject('Transaction fell in timeout'))
      .on('sent', () => console.log('Waiting transaction validation...'))
      .send(75)
  })
}

run().catch(console.log)
