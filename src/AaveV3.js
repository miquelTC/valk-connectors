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
        '0x8164Cc65827dcFe994AB23944CBC90e0aa80bFcb',
        RewardsController,
        signer
      )
      setRewardsControllerInstance(rewardsControllerInstance)

      // const uiPoolDataProvider = new ethers.Contract(
      //   '0xb00A75686293Fea5DA122E8361f6815A0B0AF48E',
      //   UiPoolDataProvider,
      //   signer
      // )
      // setUiPoolDataProvider(uiPoolDataProvider)

      const uiIncentiveDataProvider = new ethers.Contract(
        '0x265d414f80b0fca9505710e6F16dB4b67555D365',
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

  // // Unclaimed rewards amounts
  // async function getUnclaimedRewards() {
  //   console.log(uiIncentiveDataProvider)
  //   return await uiIncentiveDataProvider.getReservesIncentivesData(
  //     '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e'
  //   )
  // }
  // Unclaimed rewards amounts
  async function getUnclaimedRewards() {
    console.log(uiIncentiveDataProvider)
    return await uiIncentiveDataProvider.getUserReservesIncentivesData(
      '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
      '0xed287c5cf0b7124c0c0d1de0db2ff48d61386e61'
    )
  }

  // async function getUnclaimedRewards() {
  //   const [, allUnclaimedRewards] =
  //     await rewardsControllerInstance.getAllUserRewards(
  //       getTokens(), // Array of aTokens, sTokens or vTokens
  //       '0x5ba7fd868c40c16f7adfae6cf87121e13fc2f7a0'
  //     )
  //   console.log(allUnclaimedRewards)
  //   // return allUnclaimedRewards
  // }

  function getTokens() {
    return [
      '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
      '0xeA51d7853EEFb32b6ee06b1C12E6dcCA88Be0fFE',
      '0x0B925eD163218f6662a35e0f0371Ac234f9E9371',
      '0xC96113eED8cAB59cD8A66813bCB0cEb29F06D2e4',
      '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8',
      '0x40aAbEf1aa8f0eEc637E0E7d92fbfFB2F26A8b7B',
      '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
      '0x72E95b8931767C79bA4EeE721354d6E99a61D004',
      '0x018008bfb33d285247A21d44E50697654f754e63',
      '0xcF8d0c70c850859266f5C338b38F9D663181C314',
      '0x5E8C8A7243651DB1384C0dDfDbE39761E8e7E51a',
      '0x4228F8895C7dDA20227F6a5c6751b8Ebf19a6ba8',
      '0xA700b4eB416Be35b2911fd5Dee80678ff64fF6C9',
      '0xBae535520Abd9f8C85E58929e0006A2c8B372F74',
      '0x977b6fc5dE62598B08C85AC8Cf2b745874E8b78c',
      '0x0c91bcA95b5FE69164cE583A2ec9429A569798Ed',
      '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
      '0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8',
      '0xCc9EE9483f662091a1de4795249E24aC0aC2630f',
      '0xae8593DD575FE29A9745056aA91C4b746eee62C8',
      '0x3Fe6a295459FAe07DF8A0ceCC36F37160FE86AA9',
      '0x33652e48e4B74D18520f11BfE58Edd2ED2cEc5A2',
      '0x7B95Ec873268a6BFC6427e7a28e396Db9D0ebc65',
      '0x1b7D3F4b3c032a5AE656e30eeA4e8E1Ba376068F',
      '0x8A458A9dc9048e005d22849F470891b840296619',
      '0x6Efc73E54E41b27d2134fF9f98F15550f30DF9B1',
      '0xC7B4c17861357B8ABB91F25581E7263E08DCB59c',
      '0x8d0de040e8aAd872eC3c33A3776dE9152D3c34ca',
      '0x2516E7B3F76294e03C42AA4c5b5b4DCE9C436fB8',
      '0x3D3efceb4Ff0966D34d9545D3A2fa2dcdBf451f2',
      '0xF6D2224916DDFbbab6e6bd0D1B7034f4Ae0CaB18',
      '0xF64178Ebd2E2719F2B1233bCb5Ef6DB4bCc4d09a',
      '0x9A44fd41566876A39655f74971a3A6eA0a17a454',
      '0xc30808705C01289A3D306ca9CAB081Ba9114eC82',
    ]
  }

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
    const hugeNumber = '1000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0x7649e0d153752c556b8b23DB1f1D3d42993E83a5',
      tokenABI,
      signer
    )
    console.log(wethGatewayInstance.address)
    console.log(account)
    const allowedAmount = await tokenInstance.allowance(
      account,
      wethGatewayInstance.address
    )
    console.log('alloewed:', allowedAmount)
    await tokenInstance.approve(wethGatewayInstance.address, hugeNumber)
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
  // const etherAmount = '50000000000000001'
  const etherAmount = '5'
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
