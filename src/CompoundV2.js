import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import compoundABI from './abi/compound/goerli-abi.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [cUsdcInstance, setCUsdcInstance] = useState(null)
  const [comptrollerInstance, setComptrollerInstance] = useState(null)
  const [compoundLensInstance, setCompoundLensInstance] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)

  // Use getAllMarkets in mainnet, this is just dummy inline list for testnet since the function is not available
  // Goerli
  const ctokenMarketList = [
    '0x73506770799Eb04befb5AaE4734e58C2C624F493', // cUsdc
    '0x0545a8eaF7ff6bB6F708CbB544EA55DBc2ad7b2a', // cDai
  ]

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
      setProvider(provider)

      const signer = provider.getSigner()
      setSigner(signer)

      // Load Account
      const accounts = await provider.listAccounts()
      setAccount(accounts[0])

      const cUsdcInstance = new ethers.Contract(
        ctokenMarketList[0],
        compoundABI.cUSDC,
        signer
      )

      const comptrollerInstance = new ethers.Contract(
        '0x05Df6C772A563FfB37fD3E04C1A279Fb30228621', // Goerli
        compoundABI.Comptroller,
        signer
      )

      const compoundLensInstance = new ethers.Contract(
        '0x04EC9f6Ce8ca39Ee5c7ADE95C69e38ddcaA8CbB7', // Goerli
        compoundABI.CompoundLens,
        signer
      )

      setCUsdcInstance(cUsdcInstance)
      setComptrollerInstance(comptrollerInstance)
      setCompoundLensInstance(compoundLensInstance)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                     READ VALUES                     *
   *                                                     *
   * *****************************************************/

  const etherUSD = 1500 // TEST

  // Blocks per year
  const blocksPerDay = 7160 // ~1 bock/12 sec
  const daysPerYear = 365

  async function getPositionsData() {
    // Initialize some data before the loop by asset
    let result = {
      supply: [],
      borrow: [],
      totalSupplied: 0,
      totalBorrowed: 0,
      borrowPower: 0,
    }

    // Full list of token balances (use getAllMarkets in mainnet instead of the inline list)
    const cTokenBalances =
      await compoundLensInstance.callStatic.cTokenBalancesAll(
        ctokenMarketList,
        account
      )

    const tokenPrices =
      await compoundLensInstance.callStatic.cTokenUnderlyingPriceAll(
        ctokenMarketList
      )

    const cTokenMetadata =
      await compoundLensInstance.callStatic.cTokenMetadataAll(ctokenMarketList)

    // List of tokens supplied by the user
    const tokenSupplyList = cTokenBalances.filter(
      (cToken) => cToken.balanceOfUnderlying > 0
    )

    // List of tokens borrowed by the user
    const tokenBorrowList = cTokenBalances.filter(
      (cToken) => cToken.borrowBalanceCurrent > 0
    )

    // Loop for Supply data
    for (let token of tokenSupplyList) {
      const priceETH =
        tokenPrices.find((cToken) => cToken.cToken == token.cToken)
          .underlyingPrice /
        10 ** 18
      const price = priceETH * etherUSD
      // Token Metadata
      const metadata = cTokenMetadata.find(
        (cToken) => cToken.cToken == token.cToken
      )
      // Decimals
      const decimals = metadata.underlyingDecimals
      // Amount supplied
      const tokenBalanceSupply = token.balanceOfUnderlying
      // Supply rate per block
      const supplyRate = metadata.supplyRatePerBlock
      // Collateral Factor
      const collateralFactorMantissa = metadata.collateralFactorMantissa
      // Push data to supply result object
      result.supply.push({
        asset: token.cToken,
        amount: (tokenBalanceSupply / 10 ** decimals) * price,
        APY:
          (Math.pow(
            (supplyRate / 10 ** decimals) * blocksPerDay + 1,
            daysPerYear
          ) -
            1) *
          100,
        collateralFactor: collateralFactorMantissa / 10 ** 18,
      })
      result.totalSupplied += (tokenBalanceSupply / 10 ** decimals) * price
      result.borrowPower +=
        (tokenBalanceSupply / 10 ** decimals) *
        (collateralFactorMantissa / 10 ** 18) *
        price
    }

    // Loop for Borrow data
    for (let token of tokenBorrowList) {
      const priceETH =
        tokenPrices.find((cToken) => cToken.cToken == token.cToken)
          .underlyingPrice /
        10 ** 18
      const price = priceETH * etherUSD
      // Token Metadata
      const metadata = cTokenMetadata.find(
        (cToken) => cToken.cToken == token.cToken
      )
      // Decimals
      const decimals = metadata.underlyingDecimals
      // Amount borrowed
      const tokenBalanceBorrow = token.borrowBalanceCurrent
      // Borrow rate per block
      const borrowRate = metadata.borrowRatePerBlock
      // Push Borrow data to result object
      result.borrow.push({
        asset: token.cToken,
        amount: (tokenBalanceBorrow / 10 ** decimals) * price,
        APY:
          (Math.pow(
            (borrowRate / 10 ** decimals) * blocksPerDay + 1,
            daysPerYear
          ) -
            1) *
          100,
      })
      result.totalBorrowed += (tokenBalanceBorrow / 10 ** decimals) * price
    }
    result.healthFactor = result.borrowPower / result.totalBorrowed
    result.ltv = (result.totalBorrowed / result.totalSupplied) * 100
    result.borrowAvailable = result.borrowPower - result.totalBorrowed

    console.log(result)
    return result
  }

  async function getMarketData() {
    const tokenPrices =
      await compoundLensInstance.callStatic.cTokenUnderlyingPriceAll(
        ctokenMarketList
      )

    const cTokenMetadata =
      await compoundLensInstance.callStatic.cTokenMetadataAll(ctokenMarketList)

    // Loop for the Market data (we should use getAllMarkets on mainnet, here in testnet we are using an inline list)
    let marketData = []
    for (let token of ctokenMarketList) {
      const priceETH =
        tokenPrices.find((cToken) => cToken.cToken == token).underlyingPrice /
        10 ** 18
      const price = priceETH * etherUSD
      // Token Metadata
      console.log('list', ctokenMarketList)
      console.log('metadata', cTokenMetadata)
      console.log('prices', tokenPrices)
      const metadata = cTokenMetadata.find((cToken) => cToken.cToken == token)
      // Decimals
      const decimals = metadata.underlyingDecimals

      // Total market supply and borrow for this asset (cannot compare results, Compound is only showing these numbers in mainnet)
      const marketSupply = metadata.totalCash // not sure about this one
      const marketBorrow = metadata.totalBorrows
      const supplyRate = metadata.supplyRatePerBlock
      const borrowRate = metadata.borrowRatePerBlock
      console.log('borrowRate', borrowRate.toString())
      console.log('decimals', 10 ** decimals)

      marketData.push({
        asset: token,
        assetPrice: price,
        totalSupply: (marketSupply / 10 ** decimals) * price,
        totalBorrow: (marketBorrow / 10 ** decimals) * price,
        supplyRate:
          (Math.pow((supplyRate / 10 ** 18) * blocksPerDay + 1, daysPerYear) -
            1) *
          100,
        borrowRate:
          (Math.pow((borrowRate / 10 ** 18) * blocksPerDay + 1, daysPerYear) -
            1) *
          100,
      })
    }
    console.log('Market Data', marketData)
    return marketData
  }

  /*******************************************************
   *                                                     *
   *                      APPROVALS                      *
   *                                                     *
   * *****************************************************/

  // const compoundApproveHandler = async () => {
  //   await daiInstance.approve(cDaiInstance._address, '50000000000000000000')
  // }

  /*******************************************************
   *                                                     *
   *                      ACTIONS                        *
   *                                                     *
   * *****************************************************/

  // const compoundDepositHandler = async () => {
  //   await cDaiInstance.mint('50000000000000000000')
  // }

  // const compoundEtherDepositHandler = async () => {
  //   const cEthInstance = new ethers.Contract(
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
  //     compoundABI.cETH,
  //     signer
  //   ) // Kovan
  //   await cEthInstance.mint()
  // }

  // // Withdraw a specific token amount
  // const compoundWithdrawHandler = async () => {
  //   await cDaiInstance.redeemUnderlying('20000000000000000000')
  // }

  // // Withdraw FULL token amount
  // const compoundWithdrawFullHandler = async () => {
  //   const amount = await cDaiInstance.balanceOf(account)
  //   await cDaiInstance.redeem(amount)
  // }

  // // Witdraw a specific Ether amount
  // const compoundEtherWithdrawHandler = async () => {
  //   const cEthInstance = new ethers.Contract(
  //     compoundABI.cETH,
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72'
  //   ) // Kovan
  //   await cEthInstance.redeemUnderlying('1000000000000000')
  // }

  // // Witdraw the FULL Ether amount
  // const compoundEtherWithdrawFullHandler = async () => {
  //   const cEthInstance = new ethers.Contract(
  //     compoundABI.cETH,
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72'
  //   ) // Kovan
  //   const amount = await cEthInstance.balanceOf(account)
  //   await cEthInstance.redeem(amount)
  // }

  // const compoundEnterMarketHandler = async () => {
  //   await comptrollerInstance.enterMarkets([
  //     '0x482dC9bB08111CB875109B075A40881E48aE02Cd',
  //   ])
  // }

  // const compoundExitMarketHandler = async () => {
  //   const newBorrowPower =
  //     borrowPower -
  //     assetData.supply[1].amount * assetData.supply[1].collateralFactor
  //   if (totalBorrowed <= newBorrowPower) {
  //     await comptrollerInstance.exitMarket(
  //       '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa'
  //     )
  //   }
  // }

  // const compoundBorrowHandler = async () => {
  //   await cBatInstance.borrow('10000000000000000000')
  // }

  // const compoundEtherBorrowHandler = async () => {
  //   const cEthInstance = new ethers.Contract(
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
  //     compoundABI.cETH,
  //     signer
  //   ) // Kovan
  //   await cEthInstance.borrow('2000000000000000')
  // }

  // const compoundApproveRepayHandler = async () => {
  //   await batInstance.approve(cBatInstance._address, '5000000000000000000')
  // }

  // // Repay a specific token amount
  // const compoundRepayHandler = async () => {
  //   await cBatInstance.repayBorrow('100000000000')
  // }

  // // Repay the FULL amount of tokens passing the value (2 ** 256 - 1)
  // const compoundRepayFullHandler = async () => {
  //   await cBatInstance.repayBorrow(ethers.constants.MaxUint256)
  // }

  // // Repay a specific Ether amount
  // const compoundEtherRepayHandler = async () => {
  //   const cEthInstance = new ethers.Contract(
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
  //     compoundABI.cETH,
  //     signer
  //   ) // Kovan
  //   await cEthInstance.repayBorrow()
  // }

  // // Repay FULL Ether amount
  // const compoundEtherRepayFullHandler = async () => {
  //   const maximillion = new ethers.Contract(
  //     '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
  //     compoundABI.cETH, // Should be Maximillion ABI
  //     signer
  //   )
  //   await maximillion.repayBehalf(account)
  // }

  // CLAIM
  const compoundClaimHandle = async () => {
    // This is only informative, beause the user will claim all
    const unclaimedAmount = await comptrollerInstance.compAccrued(account)
    comptrollerInstance.claimComp(account)
  }

  return (
    <React.Fragment>
      <h1>Compound</h1>
      <button className="btn btn-primary m-3" onClick={getPositionsData}>
        Get Positions Data
      </button>
      <button className="btn btn-primary m-3" onClick={getMarketData}>
        Get Market Data
      </button>
      {/* <button className="btn btn-primary m-3" onClick={compoundApproveHandler}>
        Token Approve
      </button>
      <button className="btn btn-primary m-3" onClick={compoundDepositHandler}>
        Token Deposit
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherDepositHandler}
      >
        Ether Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={compoundWithdrawHandler}>
        Token Withdraw (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundWithdrawFullHandler}
      >
        Token Withdraw (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherWithdrawHandler}
      >
        Ether Withdraw (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherWithdrawFullHandler}
      >
        Ether Withdraw (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEnterMarketHandler}
      >
        Token Enter Market
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundExitMarketHandler}
      >
        Token Exit Market
      </button>
      <button className="btn btn-primary m-3" onClick={compoundBorrowHandler}>
        Token Borrow
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherBorrowHandler}
      >
        Ether Borrow
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundApproveRepayHandler}
      >
        Token Approve Repay
      </button>
      <button className="btn btn-primary m-3" onClick={compoundRepayHandler}>
        Token Repay (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundRepayFullHandler}
      >
        Token Repay (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherRepayHandler}
      >
        Ether Repay (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={compoundEtherRepayFullHandler}
      >
        Ether Repay (FULL)
      </button> */}
    </React.Fragment>
  )
}

export default App
