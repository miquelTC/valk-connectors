import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import addressProviderABI from './abi/aaveV3/LendingPoolAddressesProvider.json'
import lendingPoolABI from './abi/aaveV3/LendingPool.json'
import wethGatewayABI from './abi/aaveV3/wethGateway.json'
import ICreditDelegationToken from './abi/aaveV3/ICreditDelegationToken.json'
import tokenABI from './abi/IERC20.json'
import RewardsController from './abi/aaveV3/rewardsController.json'
import UiPoolDataProvider from './abi/aaveV3/UiPoolDataProvider.json'
import UiIncentiveDataProvider from './abi/aaveV3/UiIncentiveDataProvider.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [lendingPoolInstance, setLendingPoolInstance] = useState(null)
  const [rewardsControllerInstance, setRewardsControllerInstance] =
    useState(null)
  const [wethGatewayInstance, setWethGatewayInstance] = useState(null)
  const [uiPoolDataProvider, setUiPoolDataProvider] = useState(null)
  const [uiIncentiveDataProvider, setUiIncentiveDataProvider] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)

  const DECIMALS = 10 ** 18
  const ether = (wei) => wei / DECIMALS

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
      const providerInstance = new ethers.Contract(
        '0xC911B590248d127aD18546B186cC6B324e99F02c',
        addressProviderABI,
        signer
      )
      const lendingPoolAddress = await providerInstance.getPool()
      const lendingPoolInstance = new ethers.Contract(
        lendingPoolAddress,
        lendingPoolABI,
        signer
      )
      setLendingPoolInstance(lendingPoolInstance)

      const wethGatewayInstance = new ethers.Contract(
        '0x2A498323aCaD2971a8b1936fD7540596dC9BBacD',
        wethGatewayABI,
        signer
      )
      setWethGatewayInstance(wethGatewayInstance)

      const rewardsControllerInstance = new ethers.Contract(
        '<ADDRESS>',
        RewardsController,
        signer
      )
      setRewardsControllerInstance(rewardsControllerInstance)

      const uiPoolDataProvider = new ethers.Contract(
        '0xb00A75686293Fea5DA122E8361f6815A0B0AF48E',
        UiPoolDataProvider,
        signer
      )
      setUiPoolDataProvider(uiPoolDataProvider)

      const uiIncentiveDataProvider = new ethers.Contract(
        '0xf4Ce3624c8D047aF8b069D044f00bF6774B4dEc0',
        UiIncentiveDataProvider,
        signer
      )
      setUiIncentiveDataProvider(uiIncentiveDataProvider)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  // User Data (healthFactor, borrowPower, totalSupplied, totalBorrowed...)
  async function getUserData() {
    const userData = await lendingPoolInstance.getUserAccountData(account)
    return {
      healthFactor: ethers.utils.formatEther(userData.healthFactor),
      ltv: ethers.utils.formatUnits(userData.ltv, 4),
      totalSupply: ethers.utils.formatUnits(userData.totalCollateralBase, 8),
      totalBorrow: ethers.utils.formatUnits(userData.totalDebtBase, 8),
      borrowPower:
        ethers.utils.formatUnits(userData.totalCollateralBase, 8) *
        ethers.utils.formatUnits(userData.ltv, 4),
      borrowPowerUsed:
        ethers.utils.formatUnits(userData.totalDebtBase, 8) /
        (ethers.utils.formatUnits(userData.totalCollateralBase, 8) *
          ethers.utils.formatUnits(userData.ltv, 4)),
      borrowPowerAvailable:
        (ethers.utils.formatUnits(userData.totalCollateralBase, 8) *
          ethers.utils.formatUnits(userData.ltv, 4) -
          ethers.utils.formatUnits(userData.totalDebtBase, 8)) /
        (ethers.utils.formatUnits(userData.totalCollateralBase, 8) *
          ethers.utils.formatUnits(userData.ltv, 4)),
    }
  }

  // List of assets (we must add ETH on top)
  async function getAssets() {
    return await uiPoolDataProvider.getReservesList(
      '0xC911B590248d127aD18546B186cC6B324e99F02c'
    )
  }

  // User Reserves Data
  async function getUserReservesData() {
    const userReservesData = await uiPoolDataProvider.getUserReservesData(
      '0xC911B590248d127aD18546B186cC6B324e99F02c',
      account
    )
    return userReservesData[0].map((item) => {
      return {
        underlyingAsset: item.underlyingAsset,
        collateral: item.usageAsCollateralEnabledOnUser,
        principalStableDebt: item.principalStableDebt.toString(),
        scaledATokenBalance: item.scaledATokenBalance.toString(),
        scaledVariableDebt: item.scaledVariableDebt.toString(),
        stableBorrowRate: item.stableBorrowRate.toString(),
      }
    })
  }

  // Reserves Data (liquidityRate = Supply APY, borrowRate = Borrow APY, aToken, sToken, vToken)
  async function getReservesData() {
    return await uiPoolDataProvider.getReservesData(
      '0xC911B590248d127aD18546B186cC6B324e99F02c'
    )
  }

  // Unclaimed rewards amounts
  async function getUnclaimedRewards() {
    return await uiIncentiveDataProvider.getUserReservesIncentivesData(
      '0xC911B590248d127aD18546B186cC6B324e99F02c',
      account
    )
  }

  // async function getUnclaimedRewards(tokens, userAddress) {
  //   const [, allUnclaimedRewards] =
  //     await rewardsControllerInstance.getAllUserRewardsBalance(
  //       tokens, // Array of aTokens, sTokens or vTokens
  //       userAddress
  //     )
  //   return allUnclaimedRewards
  // }

  /*******************************************************
   *                                                     *
   *                      APPROVALS                      *
   *                                                     *
   * *****************************************************/

  // Token approval
  const aaveApprovalHandler = async () => {
    // const hugeNumber =
    //   '1000000000000000000000000000000000000000000000000000000000'
    // const tokenInstance = new ethers.Contract(
    //   '0xba8dced3512925e52fe67b1b5329187589072a55',
    //   tokenABI.abi,
    //   signer
    // )
    // const allowedAmount = await tokenInstance.allowance(
    //   account,
    //   lendingPoolInstance.address
    // )
    // console.log(allowedAmount)
    // if (allowedAmount == 0) {
    //   await tokenInstance.approve(lendingPoolInstance.address, hugeNumber)
    // }
    const test = await getUnclaimedRewards()
    console.log(test)
  }

  // aWETH approval - Allow the Weth Gateway contract to burn aWeth, necessary for WITHDRAW
  const aaveAWethApprovalHandler = async () => {
    console.log(provider)
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0x7649e0d153752c556b8b23DB1f1D3d42993E83a5',
      tokenABI.abi,
      signer
    )
    console.log(wethGatewayInstance.address)
    console.log(account)
    const allowedAmount = await tokenInstance.allowance(
      account,
      wethGatewayInstance.address
    )
    // if (allowedAmount == 0) {
    await tokenInstance.approve(wethGatewayInstance.address, hugeNumber)
    // }
  }

  // WETH Stable Credit Delegation - Necessary to borrow with stable rate
  const aaveCreditApprovalStableHandler = async () => {
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0xaf082611873a9b99E5e3A7C5Bea3bdb93AfA044C',
      ICreditDelegationToken,
      signer
    )
    const allowedAmount = await tokenInstance.borrowAllowance(
      account,
      wethGatewayInstance.address
    )
    console.log('allowed WETH', allowedAmount)
    if (allowedAmount == 0) {
      await tokenInstance.approveDelegation(
        wethGatewayInstance.address,
        hugeNumber
      )
    }
  }

  // WETH Variable Credit Delegation - Necessary to borrow with variable rate
  const aaveCreditApprovalVariableHandler = async () => {
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0xff3284Be0C687C21cCB18a8e61a27AeC72C520bc',
      ICreditDelegationToken,
      signer
    )
    const allowedAmount = await tokenInstance.borrowAllowance(
      account,
      wethGatewayInstance.address
    )
    console.log('allowed WETH', allowedAmount)
    if (allowedAmount == 0) {
      await tokenInstance.approveDelegation(
        wethGatewayInstance.address,
        hugeNumber
      )
    }
  }

  const daiAmount = '5000000000000000000'
  const etherAmount = '5000000000000000'
  const daiBorrowAmount = '2500000000000000000'
  const etherBorrowAmount = '2000000000000000'

  /*******************************************************
   *                                                     *
   *                       ACTIONS                       *
   *                                                     *
   * *****************************************************/

  // Token deposit
  const aaveDepositHandler = async () => {
    await lendingPoolInstance.supply(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiAmount,
      account,
      0
    )
  }

  // Ether deposit
  const aaveEtherDepositHandler = async () => {
    console.log('address', lendingPoolInstance.address)
    await wethGatewayInstance.depositETH(
      lendingPoolInstance.address,
      account,
      0,
      { value: '10000000000000000' }
    )
  }

  // Token withdraw (partial)
  const aaveWithdrawHandler = async () => {
    await lendingPoolInstance.withdraw(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiAmount,
      account
    )
  }

  // Token withdraw (FULL)
  const aaveWithdrawFullHandler = async () => {
    await lendingPoolInstance.withdraw(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      ethers.constants.MaxUint256,
      account
    )
  }

  // Ether withdraw (partial)
  const aaveEtherWithdrawHandler = async () => {
    await wethGatewayInstance.withdrawETH(
      lendingPoolInstance.address,
      etherAmount,
      account
    )
  }

  // Ether withdraw (FULL amount)
  const aaveEtherWithdrawFullHandler = async () => {
    await wethGatewayInstance.withdrawETH(
      lendingPoolInstance.address,
      ethers.constants.MaxUint256,
      account
    )
  }

  // Borrow token
  const aaveBorrowHandler = async () => {
    await lendingPoolInstance.borrow(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiBorrowAmount,
      2,
      0,
      account
    )
  }

  // Borrow Ether
  const aaveEtherBorrowHandler = async () => {
    await wethGatewayInstance.borrowETH(
      lendingPoolInstance.address,
      '2000000000000000',
      2,
      0
    )
  }

  // Token repay (partial)
  const aaveRepayHandler = async () => {
    await lendingPoolInstance.repay(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiBorrowAmount,
      2,
      account
    )
  }

  // Token repay (FULL)
  const aaveRepayFullHandler = async () => {
    await lendingPoolInstance.repay(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      ethers.constants.MaxUint256,
      2,
      account
    )
  }

  // Token repay with aToken (partial)
  const aaveRepayATokenHandler = async () => {
    await lendingPoolInstance.repay(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiBorrowAmount,
      2,
      account
    )
  }

  // Token repay with aToken (FULL)
  const aaveRepayFullATokenHandler = async () => {
    await lendingPoolInstance.repay(
      '0xba8dced3512925e52fe67b1b5329187589072a55',
      daiBorrowAmount,
      2,
      account
    )
  }

  // Ether repay (partial)
  const aaveEtherRepayHandler = async () => {
    await wethGatewayInstance.repayETH(
      lendingPoolInstance.address,
      '1000000000000000',
      2,
      account,
      { value: '1000000000000000' }
    )
  }

  // Ether repay (FULL)
  const aaveEtherRepayFullHandler = async () => {
    const tokenInstance = new ethers.Contract(
      '0xff3284Be0C687C21cCB18a8e61a27AeC72C520bc',
      ICreditDelegationToken,
      signer
    )
    const balance = await tokenInstance.balanceOf(account)
    const amount = Math.floor(balance * 1.001) // the exceeded amount is refunded automatically
    console.log('amount to repay', amount)
    await wethGatewayInstance.repayETH(
      lendingPoolInstance.address,
      ethers.constants.MaxUint256,
      1,
      account,
      { value: amount }
    )
  }

  // Claim StkAave
  const stkAaveClaimHandler = async () => {
    const amountToClaim = await rewardsControllerInstance.getUserRewardsBalance(
      ['aDai.address', 'aWeth.address'],
      account,
      'stkAave.address'
    )
    await rewardsControllerInstance.claimRewardsToSelf(
      ['aDai.address', 'aWETH.address'],
      amountToClaim,
      'stkAave.address'
    )
  }

  // Claim ALL tokens
  const claimAllHandler = async () => {
    await rewardsControllerInstance.claimAllRewardsToSelf([
      'aDai.address',
      'aWeth.address',
    ])
  }

  // const aaveDisableCollateralHandler = async () => {
  //   const newBorrowPower =
  //     (totalSupply - assetData.supply[0].amountFiat) * (ltv / 10000)
  //   if (totalDebt <= newBorrowPower) {
  //     await lendingPoolInstance.setUserUseReserveAsCollateral(
  //       '0xff795577d9ac8bd7d90ee22b6c1703490b6512fd',
  //       false
  //     )
  //   }
  // }

  // const aaveEnableCollateralHandler = async () => {
  //   await lendingPoolInstance.setUserUseReserveAsCollateral(
  //     '0xff795577d9ac8bd7d90ee22b6c1703490b6512fd',
  //     true
  //   )
  // }

  return (
    <React.Fragment>
      <h1>Aave</h1>
      <button className="btn btn-primary m-3" onClick={aaveApprovalHandler}>
        Approval
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveAWethApprovalHandler}
      >
        aWETH Approval (required to withdraw ETH)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveCreditApprovalStableHandler}
      >
        Stable Credit Approval (required to borrow ETH with stable rate)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveCreditApprovalVariableHandler}
      >
        Variable Credit Approval (required to borrow ETH with variable rate)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveDepositHandler}>
        Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherDepositHandler}>
        Ether Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={aaveWithdrawHandler}>
        Token Withdraw (partial)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveWithdrawFullHandler}>
        Token Withdraw (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherWithdrawHandler}
      >
        Ether Withdraw (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherWithdrawFullHandler}
      >
        Ether Withdraw (FULL)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveBorrowHandler}>
        Borrow
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherBorrowHandler}>
        Ether Borrow
      </button>
      <button className="btn btn-primary m-3" onClick={aaveRepayHandler}>
        Token Repay (partial)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveRepayFullHandler}>
        Token Repay (FULL)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveRepayATokenHandler}>
        aToken Repay (Partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveRepayFullATokenHandler}
      >
        aToken Repay (FULL)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherRepayHandler}>
        Ether Repay (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherRepayFullHandler}
      >
        Ether Repay (FULL)
      </button>
      {/* <button
        className="btn btn-primary m-3"
        onClick={aaveDisableCollateralHandler}
      >
        Disable Collateral
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEnableCollateralHandler}
      >
        Enable Collateral
      </button> */}
    </React.Fragment>
  )
}

export default App
