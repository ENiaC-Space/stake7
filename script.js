// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56,
    // BSC block times: ~3 seconds per block
    BLOCKS_PER_DAY: 28800,
    BLOCKS_PER_YEAR: 10512000
};

// ============================
// ABI
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function totalSupply() view returns (uint256)"
];

const MASTERCHEF_ABI = [
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    "function poolLength() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)",
    "function ANTPerBlock() view returns (uint256)",
    "function startBlock() view returns (uint256)",
    "function ANT() view returns (address)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider = null;
let signer = null;
let userAddress = null;
let chainId = null;

let eniacContract = null;
let masterchefContract = null;

let isConnected = false;
let currentPoolId = 0;
let tokenDecimals = 18;
let currentViewAddress = null;
let isViewingOtherWallet = false;

// ============================
// DOM ELEMENTS
// ============================
const connectBtn = document.getElementById('connectBtn');
const walletInfo = document.getElementById('walletInfo');
const walletBalance = document.getElementById('walletBalance');
const stakedAmount = document.getElementById('stakedAmount');
const pendingRewards = document.getElementById('pendingRewards');
const allowanceAmount = document.getElementById('allowanceAmount');
const availableBalance = document.getElementById('availableBalance');
const amountInput = document.getElementById('amountInput');
const statusMessage = document.getElementById('statusMessage');

const maxBtn = document.getElementById('maxBtn');
const approveBtn = document.getElementById('approveBtn');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimBtn = document.getElementById('claimBtn');
const viewWalletBtn = document.getElementById('viewWalletBtn');
const copyMyAddressBtn = document.getElementById('copyMyAddressBtn');
const viewMyWalletBtn = document.getElementById('viewMyWalletBtn');
const viewWalletInput = document.getElementById('viewWalletInput');

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 ENiAC Staking DApp Loading...');
    
    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
        showStatus('Please install MetaMask to use this dApp', 'error');
        connectBtn.innerHTML = '<i class="fas fa-download"></i> Install MetaMask';
        connectBtn.onclick = () => window.open('https://metamask.io/download/', '_blank');
        return;
    }
    
    console.log('✅ MetaMask detected');
    
    // Setup event listeners
    setupEventListeners();
    
    // Check for cached connection
    checkCachedConnection();
});

function setupEventListeners() {
    // Connect button
    connectBtn.addEventListener('click', connectWallet);
    
    // Transaction buttons
    maxBtn.addEventListener('click', setMaxAmount);
    approveBtn.addEventListener('click', approveTokens);
    stakeBtn.addEventListener('click', stakeTokens);
    unstakeBtn.addEventListener('click', unstakeTokens);
    claimBtn.addEventListener('click', claimRewards);
    
    // Wallet view buttons
    viewWalletBtn.addEventListener('click', viewOtherWallet);
    copyMyAddressBtn.addEventListener('click', copyMyAddress);
    viewMyWalletBtn.addEventListener('click', viewMyWallet);
    
    // Input events
    viewWalletInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') viewOtherWallet();
    });
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
        window.ethereum.on('disconnect', handleDisconnect);
    }
}

async function checkCachedConnection() {
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            userAddress = accounts[0];
            currentViewAddress = userAddress;
            console.log('🔑 Found cached account:', userAddress);
            await initializeConnection();
        }
    } catch (error) {
        console.log('No cached connection found');
    }
}

// ============================
// WALLET CONNECTION
// ============================
async function connectWallet() {
    try {
        showStatus('Requesting wallet connection...', 'info');
        
        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }
        
        userAddress = accounts[0];
        currentViewAddress = userAddress;
        isViewingOtherWallet = false;
        
        console.log('✅ Connected account:', userAddress);
        
        await initializeConnection();
        
        showStatus('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        
        let errorMsg = 'Connection failed';
        if (error.code === 4001) {
            errorMsg = 'Connection rejected by user';
        }
        
        showStatus(errorMsg, 'error');
        resetConnection();
    }
}

async function initializeConnection() {
    try {
        // Initialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        // Get network info
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        console.log('🌐 Connected to chain:', chainId);
        
        // Check if on BSC Mainnet
        if (chainId !== CONFIG.BSC_CHAIN_ID) {
            showStatus('Please switch to BSC Mainnet', 'warning');
            await switchToBSC();
            return;
        }
        
        // Initialize contracts
        await initializeContracts();
        
        // Find the correct pool
        await findPoolId();
        
        // Update UI
        updateUI();
        
        // Load data
        await loadData();
        
        isConnected = true;
        
        // Start auto-refresh
        startAutoRefresh();
        
        console.log('✅ Connection initialized successfully');
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showStatus('Initialization error: ' + error.message, 'error');
        resetConnection();
    }
}

async function switchToBSC() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }], // 0x38 = 56 in hex (BSC Mainnet)
        });
        console.log('✅ Switched to BSC Mainnet');
        // Reload after switching
        setTimeout(() => location.reload(), 1000);
    } catch (switchError) {
        if (switchError.code === 4902) {
            // Chain not added, add it
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x38',
                        chainName: 'Binance Smart Chain Mainnet',
                        nativeCurrency: {
                            name: 'BNB',
                            symbol: 'BNB',
                            decimals: 18
                        },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com']
                    }]
                });
                console.log('✅ BSC Mainnet added to MetaMask');
                setTimeout(() => location.reload(), 1000);
            } catch (addError) {
                console.error('Error adding BSC network:', addError);
                showStatus('Please manually add BSC network to MetaMask', 'error');
            }
        } else {
            console.error('Error switching to BSC:', switchError);
            showStatus('Please manually switch to BSC Mainnet', 'error');
        }
    }
}

// ============================
// CONTRACT INITIALIZATION
// ============================
async function initializeContracts() {
    try {
        console.log('🔄 Initializing contracts...');
        
        // Initialize ENiAC token contract
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        console.log('✅ ENiAC contract initialized');
        
        // Initialize MasterChef contract
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        console.log('✅ MasterChef contract initialized');
        
    } catch (error) {
        console.error('❌ Contract initialization error:', error);
        throw error;
    }
}

async function findPoolId() {
    try {
        console.log('🔍 Finding ENiAC pool...');
        
        // Try to get pool length
        const poolLength = await masterchefContract.poolLength();
        console.log('Total pools:', poolLength.toString());
        
        // Check if pool 0 is ENiAC pool
        try {
            const pool0Info = await masterchefContract.poolInfo(0);
            console.log('Pool 0 LP Token:', pool0Info.lpToken);
            
            // If pool 0 contains ENiAC token
            if (pool0Info.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                currentPoolId = 0;
                console.log('✅ Found ENiAC pool at ID: 0');
                return;
            }
        } catch (e) {
            console.log('Error checking pool 0:', e.message);
        }
        
        // Check if ANT token is ENiAC
        try {
            const antAddress = await masterchefContract.ANT();
            console.log('ANT token address:', antAddress);
            
            if (antAddress.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                currentPoolId = 0;
                console.log('✅ ANT token is ENiAC, using pool 0');
                return;
            }
        } catch (e) {
            console.log('Error getting ANT address:', e.message);
        }
        
        // Default to pool 0
        currentPoolId = 0;
        console.log('⚠️ Using default pool ID: 0');
        
    } catch (error) {
        console.error('Error finding pool:', error);
        currentPoolId = 0;
    }
}

// ============================
// WALLET VIEW FUNCTIONS
// ============================
async function viewOtherWallet() {
    try {
        const inputAddress = viewWalletInput.value.trim();
        
        if (!inputAddress) {
            showStatus('Please enter a wallet address', 'warning');
            return;
        }
        
        // Validate address
        if (!ethers.utils.isAddress(inputAddress)) {
            showStatus('Invalid wallet address format', 'error');
            return;
        }
        
        currentViewAddress = inputAddress;
        isViewingOtherWallet = true;
        
        await loadData();
        showStatus(`Viewing wallet: ${shortenAddress(inputAddress)}`, 'info');
        
        updateViewingModeUI();
        
    } catch (error) {
        console.error('View wallet error:', error);
        showStatus('Failed to view wallet: ' + error.message, 'error');
    }
}

function viewMyWallet() {
    if (!userAddress) {
        showStatus('Please connect your wallet first', 'warning');
        return;
    }
    
    currentViewAddress = userAddress;
    isViewingOtherWallet = false;
    viewWalletInput.value = '';
    
    loadData();
    showStatus('Viewing your wallet', 'info');
    
    updateViewingModeUI();
}

function copyMyAddress() {
    if (!userAddress) {
        showStatus('Please connect your wallet first', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(userAddress)
        .then(() => {
            showStatus('Address copied to clipboard!', 'success');
        })
        .catch(err => {
            showStatus('Failed to copy address: ' + err.message, 'error');
        });
}

// ============================
// UI UPDATES
// ============================
function updateUI() {
    if (userAddress) {
        // Update wallet info
        const shortAddress = shortenAddress(userAddress);
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> ${shortAddress}`;
        
        // Update connect button
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
        
        // Enable input and max button
        maxBtn.disabled = false;
        amountInput.disabled = false;
        
    } else {
        // Reset wallet info
        walletInfo.innerHTML = '<i class="fas fa-wallet"></i> <span>Not Connected</span>';
        
        // Reset connect button
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect Wallet';
        connectBtn.classList.remove('connected');
        
        // Disable buttons
        maxBtn.disabled = true;
        approveBtn.disabled = true;
        stakeBtn.disabled = true;
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
        amountInput.disabled = true;
        
        // Clear data
        clearData();
    }
    
    updateViewingModeUI();
}

function updateViewingModeUI() {
    if (isViewingOtherWallet) {
        // Viewing other wallet mode
        const shortAddr = shortenAddress(currentViewAddress);
        walletInfo.innerHTML = `<i class="fas fa-eye"></i> Viewing: ${shortAddr}`;
        walletInfo.style.background = '#374151';
        
        // Disable action buttons
        approveBtn.disabled = true;
        stakeBtn.disabled = true;
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
        maxBtn.disabled = true;
        amountInput.disabled = true;
        
        // Update connect button to show "My Wallet"
        if (userAddress) {
            connectBtn.innerHTML = '<i class="fas fa-user"></i> My Wallet';
            connectBtn.classList.remove('connected');
        }
        
    } else if (userAddress) {
        // Normal mode with connected wallet
        const shortAddr = shortenAddress(userAddress);
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> ${shortAddr}`;
        walletInfo.style.background = '#1e293b';
        
        // Enable max button and input
        maxBtn.disabled = false;
        amountInput.disabled = false;
        
        // Update connect button
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
    }
}

function clearData() {
    walletBalance.textContent = '0 ENiAC';
    stakedAmount.textContent = '0 ENiAC';
    pendingRewards.textContent = '0 ENiAC';
    allowanceAmount.textContent = '0 ENiAC';
    availableBalance.textContent = '0';
    amountInput.value = '';
    
    // Reset APR values
    const aprValue = document.getElementById('aprValue');
    const apyValue = document.getElementById('apyValue');
    const dailyRewardsAPR = document.getElementById('dailyRewardsAPR');
    const rewardPerBlock = document.getElementById('rewardPerBlock');
    const totalStaked = document.getElementById('totalStaked');
    const poolAllocPercentage = document.getElementById('poolAllocPercentage');
    const antPerBlock = document.getElementById('antPerBlock');
    
    if (aprValue) aprValue.textContent = '0%';
    if (apyValue) apyValue.textContent = '0%';
    if (dailyRewardsAPR) dailyRewardsAPR.textContent = '0%';
    if (rewardPerBlock) rewardPerBlock.textContent = '0 ENiAC';
    if (totalStaked) totalStaked.textContent = '0 ENiAC';
    if (poolAllocPercentage) poolAllocPercentage.textContent = '0%';
    if (antPerBlock) antPerBlock.textContent = '0 ENiAC';
}

function resetConnection() {
    userAddress = null;
    isConnected = false;
    currentViewAddress = null;
    isViewingOtherWallet = false;
    updateUI();
}

// ============================
// DATA LOADING
// ============================
async function loadData() {
    if (!currentViewAddress || !eniacContract || !masterchefContract) {
        return;
    }
    
    console.log('📊 Loading data...');
    
    try {
        // 1. Load wallet balance
        const balance = await eniacContract.balanceOf(currentViewAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        walletBalance.textContent = parseFloat(balanceFormatted).toFixed(4) + ' ENiAC';
        availableBalance.textContent = parseFloat(balanceFormatted).toFixed(4);
        
        // 2. Load allowance (only for user's own wallet)
        if (!isViewingOtherWallet && userAddress === currentViewAddress) {
            const allowance = await eniacContract.allowance(currentViewAddress, CONFIG.MASTERCHEF);
            const allowanceFormatted = ethers.utils.formatUnits(allowance, 18);
            allowanceAmount.textContent = parseFloat(allowanceFormatted).toFixed(4) + ' ENiAC';
            
            // Update approve button
            if (parseFloat(allowanceFormatted) > 0) {
                approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
                approveBtn.disabled = true;
                approveBtn.style.background = '#059669';
                stakeBtn.disabled = false;
            } else {
                approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
                approveBtn.disabled = false;
                approveBtn.style.background = '#10b981';
                stakeBtn.disabled = true;
            }
        } else {
            allowanceAmount.textContent = 'View Only';
        }
        
        // 3. Load staking data
        await loadStakingData();
        
        // 4. Load APR data
        await calculateAPR();
        
    } catch (error) {
        console.error('❌ Load data error:', error);
        showStatus('Error loading data: ' + error.message, 'error');
    }
}

async function loadStakingData() {
    try {
        const userInfo = await masterchefContract.userInfo(currentPoolId, currentViewAddress);
        const staked = ethers.utils.formatUnits(userInfo.amount, 18);
        stakedAmount.textContent = parseFloat(staked).toFixed(4) + ' ENiAC';
        
        // Load pending rewards
        const pending = await masterchefContract.pendingANT(currentPoolId, currentViewAddress);
        const pendingFormatted = ethers.utils.formatUnits(pending, 18);
        pendingRewards.textContent = parseFloat(pendingFormatted).toFixed(4) + ' ENiAC';
        
        // Enable/disable buttons based on staked amount (only for user's own wallet)
        if (!isViewingOtherWallet && userAddress === currentViewAddress) {
            unstakeBtn.disabled = parseFloat(staked) <= 0;
            claimBtn.disabled = parseFloat(pendingFormatted) <= 0;
        }
        
    } catch (error) {
        console.error('Error loading staking data:', error);
        stakedAmount.textContent = '0 ENiAC';
        pendingRewards.textContent = '0 ENiAC';
        if (!isViewingOtherWallet) {
            unstakeBtn.disabled = true;
            claimBtn.disabled = true;
        }
    }
}

// ============================
// APR CALCULATION
// ============================
async function calculateAPR() {
    try {
        // Get pool info
        const poolInfo = await masterchefContract.poolInfo(currentPoolId);
        const poolAllocPoint = parseFloat(poolInfo.allocPoint.toString());
        
        // Get total allocation points
        const totalAllocPoint = await masterchefContract.totalAllocPoint();
        const totalAllocPointNum = parseFloat(totalAllocPoint.toString());
        
        // Get ENiAC per block
        const antPerBlock = await masterchefContract.ANTPerBlock();
        const antPerBlockNum = parseFloat(ethers.utils.formatUnits(antPerBlock, 18));
        
        // Calculate pool's percentage and reward per block
        const poolAllocPercentage = (poolAllocPoint / totalAllocPointNum) * 100;
        const poolRewardPerBlock = antPerBlockNum * (poolAllocPoint / totalAllocPointNum);
        
        // Get total staked in pool
        let totalStaked = 0;
        try {
            const lpTokenContract = new ethers.Contract(
                poolInfo.lpToken,
                ['function balanceOf(address) view returns (uint256)'],
                provider
            );
            
            const totalStakedWei = await lpTokenContract.balanceOf(CONFIG.MASTERCHEF);
            totalStaked = parseFloat(ethers.utils.formatUnits(totalStakedWei, 18));
        } catch (error) {
            console.log('Could not get total staked:', error.message);
        }
        
        // Calculate APR
        let apr = 0;
        let apy = 0;
        
        if (totalStaked > 0 && poolRewardPerBlock > 0) {
            const annualRewards = poolRewardPerBlock * CONFIG.BLOCKS_PER_YEAR;
            apr = (annualRewards / totalStaked) * 100;
            
            // Calculate APY (compounded daily)
            const dailyRate = apr / 365 / 100;
            apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
        }
        
        // Update UI
        const aprValue = document.getElementById('aprValue');
        const apyValue = document.getElementById('apyValue');
        const dailyRewardsAPR = document.getElementById('dailyRewardsAPR');
        const rewardPerBlockEl = document.getElementById('rewardPerBlock');
        const totalStakedEl = document.getElementById('totalStaked');
        const poolAllocPercentageEl = document.getElementById('poolAllocPercentage');
        const antPerBlockEl = document.getElementById('antPerBlock');
        const aprDescription = document.getElementById('aprDescription');
        
        if (aprValue) aprValue.textContent = apr.toFixed(2) + '%';
        if (apyValue) apyValue.textContent = apy.toFixed(2) + '%';
        if (dailyRewardsAPR) dailyRewardsAPR.textContent = (apr / 365).toFixed(4) + '%';
        if (rewardPerBlockEl) rewardPerBlockEl.textContent = poolRewardPerBlock.toFixed(6) + ' ENiAC';
        if (totalStakedEl) totalStakedEl.textContent = totalStaked.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' ENiAC';
        if (poolAllocPercentageEl) poolAllocPercentageEl.textContent = poolAllocPercentage.toFixed(2) + '%';
        if (antPerBlockEl) antPerBlockEl.textContent = antPerBlockNum.toFixed(6) + ' ENiAC';
        
        // Update description
        if (aprDescription) {
            if (apr === 0) {
                aprDescription.textContent = 'No staking data available';
            } else if (apr > 100) {
                aprDescription.textContent = '🚀 Very High Yield!';
                aprDescription.style.color = '#10b981';
            } else if (apr > 50) {
                aprDescription.textContent = '📈 High Yield Opportunity';
                aprDescription.style.color = '#10b981';
            } else if (apr > 20) {
                aprDescription.textContent = '👍 Good Returns';
                aprDescription.style.color = '#f59e0b';
            } else {
                aprDescription.textContent = '📊 Moderate Returns';
                aprDescription.style.color = '#f59e0b';
            }
        }
        
    } catch (error) {
        console.error('Error calculating APR:', error);
    }
}

// ============================
// TRANSACTION FUNCTIONS
// ============================
function setMaxAmount() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    const balanceText = walletBalance.textContent;
    const balance = parseFloat(balanceText);
    
    if (!isNaN(balance) && balance > 0) {
        amountInput.value = balance.toFixed(4);
    }
}

async function approveTokens() {
    if (isViewingOtherWallet) {
        showStatus('Cannot approve for other wallets', 'warning');
        return;
    }
    
    try {
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        showStatus('Approving tokens...', 'info');
        
        // Use unlimited approval
        const maxApproval = ethers.constants.MaxUint256;
        
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, maxApproval);
        
        showStatus('Approval submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Tokens approved successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Approve error:', error);
        showStatus('Approve failed: ' + error.message, 'error');
    }
}

async function stakeTokens() {
    if (isViewingOtherWallet) {
        showStatus('Cannot stake for other wallets', 'warning');
        return;
    }
    
    try {
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        // Check balance
        const balance = await eniacContract.balanceOf(userAddress);
        const balanceNum = parseFloat(ethers.utils.formatUnits(balance, 18));
        
        if (amountNum > balanceNum) {
            showStatus(`Insufficient balance. You have ${balanceNum.toFixed(4)} ENiAC`, 'error');
            return;
        }
        
        // Check allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceNum = parseFloat(ethers.utils.formatUnits(allowance, 18));
        
        if (amountNum > allowanceNum) {
            showStatus('Insufficient allowance. Please approve first.', 'error');
            return;
        }
        
        showStatus('Staking tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        const tx = await masterchefContract.deposit(currentPoolId, amountWei);
        
        showStatus('Stake submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Tokens staked successfully!', 'success');
        amountInput.value = '';
        await loadData();
        
    } catch (error) {
        console.error('Stake error:', error);
        showStatus('Stake failed: ' + error.message, 'error');
    }
}

async function unstakeTokens() {
    if (isViewingOtherWallet) {
        showStatus('Cannot unstake for other wallets', 'warning');
        return;
    }
    
    try {
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        // Check staked amount
        const userInfo = await masterchefContract.userInfo(currentPoolId, userAddress);
        const stakedNum = parseFloat(ethers.utils.formatUnits(userInfo.amount, 18));
        
        if (amountNum > stakedNum) {
            showStatus(`Insufficient staked amount. You have ${stakedNum.toFixed(4)} ENiAC staked`, 'error');
            return;
        }
        
        showStatus('Unstaking tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei);
        
        showStatus('Unstake submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Tokens unstaked successfully!', 'success');
        amountInput.value = '';
        await loadData();
        
    } catch (error) {
        console.error('Unstake error:', error);
        showStatus('Unstake failed: ' + error.message, 'error');
    }
}

async function claimRewards() {
    if (isViewingOtherWallet) {
        showStatus('Cannot claim for other wallets', 'warning');
        return;
    }
    
    try {
        showStatus('Claiming rewards...', 'info');
        
        // Claim rewards by withdrawing 0
        const tx = await masterchefContract.withdraw(currentPoolId, 0);
        
        showStatus('Claim submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Rewards claimed successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Claim error:', error);
        showStatus('Claim failed: ' + error.message, 'error');
    }
}

// ============================
// HELPER FUNCTIONS
// ============================
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    statusEl.classList.add(type);
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

function shortenAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// ============================
// EVENT HANDLERS
// ============================
async function handleAccountsChanged(accounts) {
    console.log('Accounts changed:', accounts);
    
    if (!accounts || accounts.length === 0) {
        // Disconnected
        resetConnection();
        showStatus('Wallet disconnected', 'warning');
    } else {
        // Account changed
        userAddress = accounts[0];
        currentViewAddress = userAddress;
        isViewingOtherWallet = false;
        viewWalletInput.value = '';
        
        await initializeConnection();
        showStatus('Account changed', 'info');
    }
}

function handleChainChanged() {
    console.log('Chain changed');
    location.reload();
}

function handleDisconnect() {
    console.log('Wallet disconnected');
    resetConnection();
    showStatus('Wallet disconnected', 'warning');
}

// ============================
// AUTO REFRESH
// ============================
let refreshInterval = null;

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(async () => {
        if (isConnected && currentViewAddress) {
            await loadData();
        }
    }, 15000); // Refresh every 15 seconds
}

// ============================
// COPY CONTRACT ADDRESSES
// ============================
document.addEventListener('DOMContentLoaded', function() {
    // Add copy buttons to contract addresses
    const addresses = document.querySelectorAll('.contract-address');
    addresses.forEach(addr => {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.title = 'Copy address';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(addr.textContent)
                .then(() => showStatus('Address copied!', 'success'))
                .catch(() => showStatus('Failed to copy', 'error'));
        };
        addr.parentNode.insertBefore(copyBtn, addr.nextSibling);
    });
});
