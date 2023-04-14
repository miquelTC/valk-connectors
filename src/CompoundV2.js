import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
// import cTokenABI from './abis/CTokenInterface.json';
import tokenABI from './abis/IERC20.json'
//import compoundABI from './abi/compound/rinkeby-abi.json';
import compoundABI from './abi/compound/kovan-abi.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [daiInstance, setDaiInstance] = useState(null)
  const [cDaiInstance, setCDaiInstance] = useState(null)
  const [batInstance, setBatInstance] = useState(null)
  const [cBatInstance, setCBatInstance] = useState(null)
  const [comptrollerInstance, setComptrollerInstance] = useState(null)
  const [compoundLensInstance, setCompoundLensInstance] = useState(null)
  const [assetData, setAssetData] = useState(null)
  const [totalBorrowed, setTotalBorrowed] = useState(null)
  const [borrowPower, setBorrowPower] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)

  // Use getAllMarkets in mainnet, this is just dummy inline list for testnet since the function is not available
  // Rinkeby
  // const ctokenMarketList = [
  //   '0xEBf1A11532b93a529b5bC942B4bAA98647913002', // cBat
  //   '0x6D7F0754FFeb405d23C51CE938289d4835bE3b14', // cDai
  //   '0xd6801a1DfFCd0a410336Ef88DeF4320D6DF1883e' // cEth
  // ];
  const ctokenMarketList = [
    '0x4a77fAeE9650b09849Ff459eA1476eaB01606C7a', // cBat
    '0xF0d0EB522cfa50B716B3b1604C4F0fA6f04376AD', // cDai
    '0x41B5844f4680a8C38fBb695b7F9CFd1F64474a72', // cEth
    //'0x39AA39c021dfbaE8faC545936693aC917d5E7563'  // cUsdc
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

      await provider.send('eth_requestAccounts', [])
      const signer = provider.getSigner()
      setSigner(signer)

      // Load Account
      const accounts = await provider.listAccounts()
      setAccount(accounts[0])

      // Load Contracts
      const cDaiInstance = new ethers.Contract(
        '0xF0d0EB522cfa50B716B3b1604C4F0fA6f04376AD',
        compoundABI.cDAI,
        signer
      ) // Kovan
      const cBatInstance = new ethers.Contract(
        '0x4a77fAeE9650b09849Ff459eA1476eaB01606C7a',
        compoundABI.cBAT,
        signer
      ) // Kovan
      const daiInstance = new ethers.Contract(
        '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
        tokenABI.abi,
        signer
      ) // Kovan
      const batInstance = new ethers.Contract(
        '0x482dC9bB08111CB875109B075A40881E48aE02Cd',
        tokenABI.abi,
        signer
      ) // Kovan
      const comptrollerInstance = new ethers.Contract(
        '0x5eae89dc1c671724a672ff0630122ee834098657',
        compoundABI.Comptroller,
        signer
      )

      const compoundLensInstance = new ethers.Contract(
        compoundABI.CompoundLens,
        '0xdCbDb7306c6Ff46f77B349188dC18cEd9DF30299'
      ) // Mainnet

      setCDaiInstance(cDaiInstance)
      setCBatInstance(cBatInstance)
      setDaiInstance(daiInstance)
      setBatInstance(batInstance)
      setComptrollerInstance(comptrollerInstance)
      setCompoundLensInstance(compoundLensInstance)

      const etherUSD = 1500

      const tokenPrices = await compoundLensInstance.cTokenUnderlyingPriceAll(
        ctokenMarketList
      )
      console.log('prices', tokenPrices)

      const cTokenMetadata = await compoundLensInstance.cTokenMetadataAll(
        ctokenMarketList
      )
      console.log('cToken metadata', cTokenMetadata)

      /*******************************************************
       *                                                     *
       *                    READ VALUES                      *
       *                                                     *
       * *****************************************************/

      // Blocks per year
      const blocksPerDay = 7160 // ~1 bock/12 sec
      const daysPerYear = 365

      // Initialize some data before the loop by asset
      let assetData = { supply: [], borrow: [] }
      let marketData = []
      let totalSupply = 0
      let totalBorrowed = 0
      let borrowPower = 0

      // Full list of token balances (use getAllMarkets in mainnet instead of the inline list)
      const cTokenBalances = await compoundLensInstance.methods
        .cTokenBalancesAll(ctokenMarketList, accounts[0])
        .call()
      console.log('cTokenBalances', cTokenBalances)

      // List of tokens supplied by the user
      const tokenSupplyList = cTokenBalances.filter(
        (cToken) => cToken.balanceOfUnderlying > 0
      )
      console.log('token supply list', tokenSupplyList)

      // List of tokens borrowed by the user
      const tokenBorrowList = cTokenBalances.filter(
        (cToken) => cToken.borrowBalanceCurrent > 0
      )
      console.log('token borrow list', tokenBorrowList)

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
        // Push data to supply assetData object
        assetData.supply.push({
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
        totalSupply += (tokenBalanceSupply / 10 ** decimals) * price
        borrowPower +=
          (tokenBalanceSupply / 10 ** decimals) *
          (collateralFactorMantissa / 10 ** 18) *
          price
      }
      console.log('test1', assetData)

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
        // Push Borrow data to assetData object
        assetData.borrow.push({
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
        totalBorrowed += (tokenBalanceBorrow / 10 ** decimals) * price
      }

      // Loop for the Market data (we should use getAllMarkets on mainnet, here in testnet we are using an inline list)
      for (let token of ctokenMarketList) {
        const priceETH =
          tokenPrices.find((cToken) => cToken.cToken == token).underlyingPrice /
          10 ** 18
        const price = priceETH * etherUSD
        // Token Metadata
        const metadata = cTokenMetadata.find((cToken) => cToken.cToken == token)
        // Decimals
        const decimals = metadata.underlyingDecimals

        // Total market supply and borrow for this asset (cannot compare results, Compound is only showing these numbers in mainnet)
        const marketSupply = metadata.totalCash // not sure about this one
        const marketBorrow = metadata.totalBorrows
        const supplyRate = metadata.supplyRatePerBlock
        const borrowRate = metadata.borrowRatePerBlock

        marketData.push({
          asset: token,
          assetPrice: price,
          totalSupply: (marketSupply / 10 ** decimals) * price,
          totalBorrow: (marketBorrow / 10 ** decimals) * price,
          supplyRate:
            (Math.pow(
              (supplyRate / 10 ** decimals) * blocksPerDay + 1,
              daysPerYear
            ) -
              1) *
            100,
          borrowRate:
            (Math.pow(
              (borrowRate / 10 ** decimals) * blocksPerDay + 1,
              daysPerYear
            ) -
              1) *
            100,
        })
      }

      setAssetData(assetData)
      setTotalSupply(totalSupply)
      setTotalBorrowed(totalBorrowed)
      setBorrowPower(borrowPower)
      setMarketData(marketData)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                      APPROVALS                      *
   *                                                     *
   * *****************************************************/

  const compoundApproveHandler = async () => {
    await daiInstance.approve(cDaiInstance._address, '50000000000000000000')
  }

  const compoundDepositHandler = async () => {
    await cDaiInstance.mint('50000000000000000000')
  }

  const compoundEtherDepositHandler = async () => {
    const cEthInstance = new ethers.Contract(
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
      compoundABI.cETH,
      signer
    ) // Kovan
    await cEthInstance.mint()
  }

  // Withdraw a specific token amount
  const compoundWithdrawHandler = async () => {
    await cDaiInstance.redeemUnderlying('20000000000000000000')
  }

  // Withdraw FULL token amount
  const compoundWithdrawFullHandler = async () => {
    const amount = await cDaiInstance.balanceOf(account)
    await cDaiInstance.redeem(amount)
  }

  // Witdraw a specific Ether amount
  const compoundEtherWithdrawHandler = async () => {
    const cEthInstance = new ethers.Contract(
      compoundABI.cETH,
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72'
    ) // Kovan
    await cEthInstance.redeemUnderlying('1000000000000000')
  }

  // Witdraw the FULL Ether amount
  const compoundEtherWithdrawFullHandler = async () => {
    const cEthInstance = new ethers.Contract(
      compoundABI.cETH,
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72'
    ) // Kovan
    const amount = await cEthInstance.balanceOf(account)
    await cEthInstance.redeem(amount)
  }

  const compoundEnterMarketHandler = async () => {
    await comptrollerInstance.enterMarkets([
      '0x482dC9bB08111CB875109B075A40881E48aE02Cd',
    ])
  }

  const compoundExitMarketHandler = async () => {
    const newBorrowPower =
      borrowPower -
      assetData.supply[1].amount * assetData.supply[1].collateralFactor
    if (totalBorrowed <= newBorrowPower) {
      await comptrollerInstance.exitMarket(
        '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa'
      )
    }
  }

  const compoundBorrowHandler = async () => {
    await cBatInstance.borrow('10000000000000000000')
  }

  const compoundEtherBorrowHandler = async () => {
    const cEthInstance = new ethers.Contract(
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
      compoundABI.cETH,
      signer
    ) // Kovan
    await cEthInstance.borrow('2000000000000000')
  }

  const compoundApproveRepayHandler = async () => {
    await batInstance.approve(cBatInstance._address, '5000000000000000000')
  }

  // Repay a specific token amount
  const compoundRepayHandler = async () => {
    await cBatInstance.repayBorrow('100000000000')
  }

  // Repay the FULL amount of tokens passing the value (2 ** 256 - 1)
  const compoundRepayFullHandler = async () => {
    await cBatInstance.repayBorrow(ethers.constants.MaxUint256)
  }

  // Repay a specific Ether amount
  const compoundEtherRepayHandler = async () => {
    const cEthInstance = new ethers.Contract(
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
      compoundABI.cETH,
      signer
    ) // Kovan
    await cEthInstance.repayBorrow()
  }

  // Repay FULL Ether amount
  const compoundEtherRepayFullHandler = async () => {
    const maximillion = new ethers.Contract(
      '0x41b5844f4680a8c38fbb695b7f9cfd1f64474a72',
      compoundABI.cETH, // Should be Maximillion ABI
      signer
    )
    await maximillion.repayBehalf(account)
  }

  // CLAIM
  const compoundClaimHandle = async () => {
    // This is only informative, beause the user will claim all
    const unclaimedAmount = await comptrollerInstance.compAccrued(account)
    comptrollerInstance.claimComp(account)
  }

  return (
    <React.Fragment>
      <h1>Compound</h1>
      <button className="btn btn-primary m-3" onClick={compoundApproveHandler}>
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
      </button>
    </React.Fragment>
  )
}

export default App
