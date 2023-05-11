import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import Comet from './abi/compoundV3/comet.json'
import tokenABI from './abi/IERC20.json'
import Rewards from './abi/compoundV3/rewards.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [usdcComet, setUsdcComet] = useState(null)
  const [usdc, setUsdc] = useState(null)
  const [rewards, setRewards] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)

  useEffect(() => {
    // Function to fetch all the blockchain data
    const loadBlockchainData = async () => {
      // Request accounts acccess if needed
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' })
      } catch (error) {
        console.error(error)
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = provider.getSigner()
      setProvider(provider)
      setSigner(signer)

      // Load Account
      const accounts = await provider.listAccounts()
      setAccount(accounts[0])

      // Load Contracts
      const usdcComet = new ethers.Contract(
        // '0x3EE77595A8459e93C2888b13aDB354017B198188',
        '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
        Comet,
        signer
      )
      setUsdcComet(usdcComet)

      const usdc = new ethers.Contract(
        '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
        tokenABI,
        signer
      )
      setUsdc(usdc)

      const rewards = new ethers.Contract(
        '0x1B0e765F6224C21223AeA2af16c1C46E38885a40', // MAINNET
        Rewards,
        signer
      )
      setRewards(rewards)

      // Get Pending to claim
      const [tokenAddress, amtOwed] = await rewards.callStatic.getRewardOwed(
        usdcComet.address,
        account
      )
    }

    loadBlockchainData()
  }, [])

  const depositAmount = '10000000'
  const withdrawAmount = '5000000'
  const userA = '0xA'
  const userB = '0xB'

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  // USDC Balance
  async function getUsdcBalance() {
    const balance = await usdc.balanceOf(account)
    return ethers.utils.formatUnits(balance, 6)
  }

  //  ETH Balance
  async function getEthBalance() {
    const balance = await provider.getBalance(account)
    return ethers.utils.formatUnits(balance, 6)
  }

  // Assets list
  async function getAssets() {
    const numAssets = await usdcComet.numAssets()
    let assetsReq = []
    for (let i = 0; i < numAssets; i++) {
      assetsReq.push(usdcComet.getAssetInfo(i))
    }
    return await Promise.all(assetsReq)
  }

  // Supply Balance
  async function getSupplyBalance() {
    const balance = await usdcComet.balanceOf(account)
    const decimals = await usdc.decimals()
    return ethers.utils.formatUnits(balance, decimals)
  }

  // Collateral Balance
  // You can iterate through all assets provided by getAssets()
  async function getCollateralBalance(asset) {
    const token = new ethers.Contract(asset, tokenABI.abi, provider)
    const balance = await usdcComet.userCollateral(account, asset)
    const decimals = await token.decimals()
    return ethers.utils.formatUnits(balance, decimals)
  }

  // Borrow Balance
  async function getBorrowBalance() {
    const balance = await usdcComet.borrowBalanceOf(account)
    const decimals = await usdc.decimals()
    return ethers.utils.formatUnits(balance, decimals)
  }

  // Supply APR
  async function getSupplyApr() {
    const utilization = await usdcComet.getUtilization()
    const supplyRate = await usdcComet.getSupplyRate(utilization)
    const secondsPerYear = 3600 * 24 * 365
    return ethers.utils.formatEther(supplyRate) * secondsPerYear * 100
  }

  // Borrow APR
  async function getBorrowApr() {
    const utilization = await usdcComet.getUtilization()
    const borrowRate = await usdcComet.getBorrowRate(utilization)
    const secondsPerYear = 3600 * 24 * 365
    return ethers.utils.formatEther(borrowRate) * secondsPerYear * 100
  }

  // Health Factor
  async function getHealthFactor() {
    const borrowBalance = await getBorrowBalance()
    if (borrowBalance == '0') return 0
    const assets = await getAssets()
    const collateralReq = []
    const priceReq = []
    const decimalsReq = []
    for (let i = 0; i < assets.length; i++) {
      collateralReq.push(usdcComet.userCollateral(account, assets[i].asset))
      priceReq.push(usdcComet.getPrice(assets[i].priceFeed))
      const token = new ethers.Contract(assets[i].asset, tokenABI, provider)
      decimalsReq.push(token.decimals())
    }
    const collateralRes = await Promise.all(collateralReq)
    const priceRes = await Promise.all(priceReq)
    const decimalsRes = await Promise.all(decimalsReq)
    const healthFactorNum = collateralRes.reduce(
      (acc, collateralItem, index) => {
        const assetItem = assets[index]
        if (assetItem) {
          acc +=
            ethers.utils.formatUnits(
              collateralItem.balance,
              decimalsRes[index]
            ) *
            ethers.utils.formatEther(assetItem.liquidateCollateralFactor) *
            ethers.utils.formatUnits(priceRes[index], 8)
        }
        return acc
      },
      0
    )
    return (healthFactorNum / borrowBalance) * 100
  }

  // LTV
  async function getLtv() {
    const assets = await getAssets()
    const collateralReq = []
    const priceReq = []
    const decimalsReq = []
    for (let i = 0; i < assets.length; i++) {
      collateralReq.push(usdcComet.userCollateral(account, assets[i].asset))
      priceReq.push(usdcComet.getPrice(assets[i].priceFeed))
      const token = new ethers.Contract(assets[i].asset, tokenABI, provider)
      decimalsReq.push(token.decimals())
    }
    const collateralRes = await Promise.all(collateralReq)
    const priceRes = await Promise.all(priceReq)
    const decimalsRes = await Promise.all(decimalsReq)
    const collateralUsd = collateralRes.reduce((acc, collateralItem, index) => {
      const assetItem = assets[index]
      if (assetItem) {
        acc +=
          ethers.utils.formatUnits(collateralItem.balance, decimalsRes[index]) *
          ethers.utils.formatUnits(priceRes[index], 8)
      }
      return acc
    }, 0)
    return ((await getBorrowBalance()) / collateralUsd) * 100
  }

  // Borrow capacity
  async function getBorrowCapacity() {
    const assets = await getAssets()
    const collateralReq = []
    const priceReq = []
    const decimalsReq = []
    for (let i = 0; i < assets.length; i++) {
      collateralReq.push(usdcComet.userCollateral(account, assets[i].asset))
      priceReq.push(usdcComet.getPrice(assets[i].priceFeed))
      const token = new ethers.Contract(assets[i].asset, tokenABI, provider)
      decimalsReq.push(token.decimals())
    }
    const collateralRes = await Promise.all(collateralReq)
    const priceRes = await Promise.all(priceReq)
    const decimalsRes = await Promise.all(decimalsReq)
    const borrowCapacity = collateralRes.reduce(
      (acc, collateralItem, index) => {
        const assetItem = assets[index]
        if (assetItem) {
          acc +=
            ethers.utils.formatUnits(
              collateralItem.balance,
              decimalsRes[index]
            ) *
            ethers.utils.formatEther(assetItem.borrowCollateralFactor) *
            ethers.utils.formatUnits(priceRes[index], 8)
        }
        return acc
      },
      0
    )
    return borrowCapacity
  }

  // Available to borrow
  async function getBorrowAvailable() {
    const borrowCapacityUSD = await getBorrowCapacity()
    const borrowBalance = await usdcComet.borrowBalanceOf(account)
    const basePriceFeed = await usdcComet.baseTokenPriceFeed()
    const borrowPrice = await usdcComet.getPrice(basePriceFeed)
    const borrowBalanceUSD =
      ethers.utils.formatUnits(borrowBalance, 6) *
      ethers.utils.formatUnits(borrowPrice, 8)
    return borrowCapacityUSD - borrowBalanceUSD
  }

  async function getClaimableRewards() {
    const [tokenAddress, amtOwed] = await rewards.callStatic.getRewardOwed(
      usdcComet.address,
      account
    )
    return amtOwed
  }

  // Total supply in the protocol
  async function getTotalSupply() {
    return usdcComet.totalSupply()
  }

  // Total Borrow in the protocol
  async function getTotalBorrow() {
    return usdcComet.totalBorrow()
  }

  // Total Collateral in the protocol
  async function getTotalCollateral() {
    const assets = await getAssets()
    const collateralReq = []
    const priceReq = []
    const decimalsReq = []
    for (let i = 0; i < assets.length; i++) {
      collateralReq.push(usdcComet.totalsCollateral(assets[i].asset))
      priceReq.push(usdcComet.getPrice(assets[i].priceFeed))
      const token = new ethers.Contract(assets[i].asset, tokenABI, provider)
      decimalsReq.push(token.decimals())
    }
    const collateralAmounts = await Promise.all(collateralReq)
    const prices = await Promise.all(priceReq)
    const decimals = await Promise.all(decimalsReq)
    const totalCollateral = collateralAmounts.reduce(
      (acc, collateral, index) => {
        const assetItem = assets[index]
        if (assetItem) {
          acc +=
            ethers.utils.formatUnits(
              collateral.totalSupplyAsset,
              decimals[index]
            ) * ethers.utils.formatUnits(prices[index], 8)
        }

        return acc
      },
      0
    )
    return totalCollateral
  }

  /*******************************************************
   *                                                     *
   *                       APPROVAL                      *
   *                                                     *
   * *****************************************************/

  const compoundApproveHandler = async () => {
    await usdc.approve(usdcComet.address, '50000000000000000000')
  }
  /**
   * Deposits have several utilities in Compound V3:
   * Supply Collateral
   * Supply Base asset to earn interests (USDC for USDC contracts, or ETH for ETH contracts)
   * Repay an open borrow
   */
  // Deposit token
  const depositHandler = async () => {
    await usdcComet.supply(usdc.address, depositAmount)
  }

  // Deposit token To userA
  const depositToHandler = async () => {
    await usdcComet.supplyTo(userA, usdc.address, depositAmount)
  }

  // Deposit token From userA To userB (it requires token approval from userA to me)
  const depositFromHandler = async () => {
    await usdcComet.supplyFrom(userA, userB, usdc.address, depositAmount)
  }

  /**
   * Withdrawals have several utilities in Compound V3:
   * Withdraw Collateral which is not supporting a borrow
   * Borrow Base asset (USDC for USDC contracts, or ETH for ETH contracts)
   * Repay an open borrow
   */
  // Withdraw token
  const withdrawHandler = async () => {
    await usdcComet.withdraw(usdc.address, withdrawAmount)
  }

  // Withdraw token To userA
  const withdrawToHandler = async () => {
    await usdcComet.withdrawTo(usdc.address, withdrawAmount)
  }

  // Withdraw token From userA To userB (it requires token approval from userA to me)
  const withdrawFromHandler = async () => {
    await usdcComet.withdrawFrom(usdc.address, withdrawAmount)
  }

  // CLAIM
  const claimHandler = async () => {
    await rewards.claim(usdcComet.address, account, true)
  }

  return (
    <React.Fragment>
      <h1>Compound</h1>
      <button className="btn btn-primary m-3" onClick={compoundApproveHandler}>
        Token Approve
      </button>
      <button className="btn btn-primary m-3" onClick={depositHandler}>
        Token Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={withdrawHandler}>
        Token Withdraw
      </button>
    </React.Fragment>
  )
}

export default App
