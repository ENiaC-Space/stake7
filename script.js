// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56,
    BLOCKS_PER_DAY: 28800,
    BLOCKS_PER_YEAR: 10512000
};

// ============================
// COMPLETE ABI FOR STAKE FUNCTION
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)"
];

const MASTERCHEF_ABI = [
    // User Functions
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    
    // View Functions
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    
    // Pool Info
    "function poolLength() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)",
    
    // Reward Info
    "function ANTPerBlock() view returns (uint256)",
    "function startBlock() view returns (uint256)",
    
    // Token Info
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
let currentPoolId = 0; // Default to pool 0
let tokenDecimals = 18;
let currentViewAddress = null;
let isViewingOtherWallet = false;

// ============================
// SIMPLIFIED INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', () => {
    console.log('ENiAC Staking DApp Loading...');
    
    if (typeof window.ethereum === 'undefined') {
        showStatus('Please install MetaMask!', 'error');
        connectBtn.innerHTML = '<i class="fas fa-download"></i> Install MetaMask';
        connectBtn.onclick = () => window.open('https://metamask.io/download/', '_blank');
        return;
    }
    
    setupEventListeners();
    
    // Check if already connected
    window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
            if (accounts.length > 0) {
                userAddress = accounts[0];
                currentViewAddress = userAddress;
                initializeApp();
            }
        })
        .catch(err => console.log('No cached connection'));
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
    
    // Wallet buttons
    viewWalletBtn.addEventListener('click', viewOtherWallet);
    copyMyAddressBtn.addEventListener('click', copyMyAddress);
    viewMyWalletBtn.addEventListener('click', viewMyWallet);
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                userAddress = accounts[0];
                currentViewAddress = userAddress;
                initializeApp();
            } else {
                resetApp();
            }
        });
        
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }
}

async function connectWallet() {
    try {
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        userAddress = accounts[0];
        currentViewAddress = userAddress;
        isViewingOtherWallet = false;
        
        await initializeApp();
        showStatus('Wallet connected!', 'success');
        
    } catch (error) {
        console.error('Connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
    }
}

async function initializeApp() {
    try {
        // Update UI
        updateUI();
        
        // Initialize provider
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        // Get network
        const network = await provider.getNetwork();
        chainId = network.chainId;
        
        // Check network
        if (chainId !== CONFIG.BSC_CHAIN_ID) {
            showStatus('Please switch to BSC Mainnet (Chain ID: 56)', 'warning');
            return;
        }
        
        // Initialize contracts
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Load data
        await loadData();
        
        isConnected = true;
        
        // Start auto-refresh
        setInterval(loadData, 15000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showStatus('Initialization error: ' + error.message, 'error');
    }
}

// ============================
// STAKE FUNCTION - FIXED
// ============================
async function stakeTokens() {
    try {
        // Check connection
        if (!userAddress || !eniacContract || !masterchefContract) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        // Get amount
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        console.log('Attempting to stake:', amountNum, 'ENiAC');
        
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
        
        // Convert amount to wei
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        console.log('Amount in wei:', amountWei.toString());
        
        // Try different pool IDs if needed
        const poolIdsToTry = [0, 1, 2, 3];
        let tx = null;
        
        for (const pid of poolIdsToTry) {
            try {
                console.log(`Trying pool ${pid}...`);
                
                // First check if pool exists and is valid
                const poolInfo = await masterchefContract.poolInfo(pid);
                console.log(`Pool ${pid} info:`, poolInfo);
                
                // Try to stake in this pool
                tx = await masterchefContract.deposit(pid, amountWei, {
                    gasLimit: 300000 // Fixed gas limit to avoid estimation issues
                });
                
                currentPoolId = pid;
                console.log(`Stake successful in pool ${pid}`);
                break;
                
            } catch (poolError) {
                console.log(`Pool ${pid} failed:`, poolError.message);
                continue;
            }
        }
        
        if (!tx) {
            throw new Error('Could not stake in any pool');
        }
        
        showStatus('Stake submitted. Waiting for confirmation...', 'info');
        
        // Wait for transaction
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showStatus(`Successfully staked ${amountNum} ENiAC!`, 'success');
            amountInput.value = '';
            await loadData();
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.error('Stake error:', error);
        
        let errorMsg = 'Stake failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees';
        } else if (error.message.includes('execution reverted')) {
            errorMsg = 'Contract execution failed. Please try a different amount.';
        }
        
        showStatus(errorMsg, 'error');
        
        // Try a simple test transaction
        if (error.message.includes('execution reverted')) {
            showStatus('Trying test transaction with 0.001 ENiAC...', 'info');
            
            try {
                const testAmount = ethers.utils.parseUnits('0.001', 18);
                const testTx = await masterchefContract.deposit(0, testAmount, {
                    gasLimit: 300000
                });
                
                await testTx.wait();
                showStatus('Test stake successful! Please try your amount again.', 'success');
            } catch (testError) {
                console.error('Test stake failed:', testError);
            }
        }
    }
}

// ============================
// APPROVE FUNCTION
// ============================
async function approveTokens() {
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
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

// ============================
// OTHER FUNCTIONS
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

async function unstakeTokens() {
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        showStatus('Unstaking tokens...', 'info');
        
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei, {
            gasLimit: 300000
        });
        
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
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        showStatus('Claiming rewards...', 'info');
        
        // Withdraw 0 to claim rewards
        const tx = await masterchefContract.withdraw(currentPoolId, 0, {
            gasLimit: 300000
        });
        
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
// DATA LOADING
// ============================
async function loadData() {
    if (!currentViewAddress) return;
    
    try {
        // Load wallet balance
        const balance = await eniacContract.balanceOf(currentViewAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        walletBalance.textContent = parseFloat(balanceFormatted).toFixed(4) + ' ENiAC';
        availableBalance.textContent = parseFloat(balanceFormatted).toFixed(4);
        
        // Load allowance (only for user's wallet)
        if (userAddress === currentViewAddress) {
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
        }
        
        // Load staking data
        await loadStakingData();
        
        // Load APR data
        await calculateAPR();
        
    } catch (error) {
        console.error('Load data error:', error);
    }
}

async function loadStakingData() {
    try {
        // Try multiple pool IDs
        for (let pid = 0; pid < 4; pid++) {
            try {
                const userInfo = await masterchefContract.userInfo(pid, currentViewAddress);
                const staked = ethers.utils.formatUnits(userInfo.amount, 18);
                
                if (parseFloat(staked) > 0) {
                    currentPoolId = pid;
                    stakedAmount.textContent = parseFloat(staked).toFixed(4) + ' ENiAC';
                    
                    // Load pending rewards
                    const pending = await masterchefContract.pendingANT(pid, currentViewAddress);
                    const pendingFormatted = ethers.utils.formatUnits(pending, 18);
                    pendingRewards.textContent = parseFloat(pendingFormatted).toFixed(4) + ' ENiAC';
                    
                    // Enable buttons
                    unstakeBtn.disabled = false;
                    claimBtn.disabled = false;
                    return;
                }
            } catch (error) {
                continue;
            }
        }
        
        // If no staking found
        stakedAmount.textContent = '0 ENiAC';
        pendingRewards.textContent = '0 ENiAC';
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
        
    } catch (error) {
        console.error('Load staking data error:', error);
    }
}

async function calculateAPR() {
    try {
        const poolInfo = await masterchefContract.poolInfo(currentPoolId);
        const totalAllocPoint = await masterchefContract.totalAllocPoint();
        const antPerBlock = await masterchefContract.ANTPerBlock();
        
        // Calculate APR
        const poolRewardPerBlock = antPerBlock.mul(poolInfo.allocPoint).div(totalAllocPoint);
        const poolRewardPerBlockFormatted = parseFloat(ethers.utils.formatUnits(poolRewardPerBlock, 18));
        
        // Get total staked
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
        if (totalStaked > 0 && poolRewardPerBlockFormatted > 0) {
            const annualRewards = poolRewardPerBlockFormatted * CONFIG.BLOCKS_PER_YEAR;
            apr = (annualRewards / totalStaked) * 100;
        }
        
        // Update UI
        const aprValue = document.getElementById('aprValue');
        const apyValue = document.getElementById('apyValue');
        const dailyRewardsAPR = document.getElementById('dailyRewardsAPR');
        const rewardPerBlock = document.getElementById('rewardPerBlock');
        const totalStakedEl = document.getElementById('totalStaked');
        const antPerBlockEl = document.getElementById('antPerBlock');
        
        if (aprValue) aprValue.textContent = apr.toFixed(2) + '%';
        if (apyValue) apyValue.textContent = (Math.pow(1 + apr/365/100, 365) - 1) * 100).toFixed(2) + '%';
        if (dailyRewardsAPR) dailyRewardsAPR.textContent = (apr / 365).toFixed(4) + '%';
        if (rewardPerBlock) rewardPerBlock.textContent = poolRewardPerBlockFormatted.toFixed(6) + ' ENiAC';
        if (totalStakedEl) totalStakedEl.textContent = totalStaked.toLocaleString() + ' ENiAC';
        if (antPerBlockEl) antPerBlockEl.textContent = parseFloat(ethers.utils.formatUnits(antPerBlock, 18)).toFixed(6) + ' ENiAC';
        
    } catch (error) {
        console.error('APR calculation error:', error);
    }
}

// ============================
// UI FUNCTIONS
// ============================
function updateUI() {
    if (userAddress) {
        const shortAddr = userAddress.substring(0, 6) + '...' + userAddress.substring(userAddress.length - 4);
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> ${shortAddr}`;
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
        
        // Enable inputs
        maxBtn.disabled = false;
        amountInput.disabled = false;
        
    } else {
        walletInfo.innerHTML = '<i class="fas fa-wallet"></i> <span>Not Connected</span>';
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect Wallet';
        connectBtn.classList.remove('connected');
        
        // Disable everything
        maxBtn.disabled = true;
        approveBtn.disabled = true;
        stakeBtn.disabled = true;
        unstakeBtn.disabled = true;
        claimBtn.disabled = true;
        amountInput.disabled = true;
        
        clearData();
    }
}

function clearData() {
    walletBalance.textContent = '0 ENiAC';
    stakedAmount.textContent = '0 ENiAC';
    pendingRewards.textContent = '0 ENiAC';
    allowanceAmount.textContent = '0 ENiAC';
    availableBalance.textContent = '0';
    amountInput.value = '';
}

function resetApp() {
    userAddress = null;
    isConnected = false;
    currentViewAddress = null;
    isViewingOtherWallet = false;
    updateUI();
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
        
        if (!ethers.utils.isAddress(inputAddress)) {
            showStatus('Invalid wallet address', 'error');
            return;
        }
        
        currentViewAddress = inputAddress;
        isViewingOtherWallet = true;
        
        await loadData();
        showStatus(`Viewing wallet: ${inputAddress.substring(0, 10)}...`, 'info');
        
        // Update UI for viewing mode
        walletInfo.innerHTML = `<i class="fas fa-eye"></i> Viewing: ${inputAddress.substring(0, 6)}...`;
        walletInfo.style.background = '#374151';
        
    } catch (error) {
        console.error('View wallet error:', error);
        showStatus('Failed to view wallet: ' + error.message, 'error');
    }
}

function viewMyWallet() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    currentViewAddress = userAddress;
    isViewingOtherWallet = false;
    viewWalletInput.value = '';
    
    loadData();
    showStatus('Viewing your wallet', 'info');
    
    // Reset UI
    updateUI();
}

function copyMyAddress() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(userAddress)
        .then(() => showStatus('Address copied!', 'success'))
        .catch(() => showStatus('Failed to copy', 'error'));
}

// ============================
// HELPER FUNCTIONS
// ============================
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    statusEl.classList.add(type);
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// Add copy buttons for contract addresses
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.contract-address').forEach(addr => {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(addr.textContent)
                .then(() => showStatus('Address copied!', 'success'))
                .catch(() => showStatus('Failed to copy', 'error'));
        };
        addr.parentNode.insertBefore(copyBtn, addr.nextSibling);
    });
});
