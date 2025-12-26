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
// SIMPLIFIED ABI
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

const MASTERCHEF_ABI = [
    // Basic functions only
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider = null;
let signer = null;
let userAddress = null;
let eniacContract = null;
let masterchefContract = null;
let currentPoolId = 0;

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', () => {
    console.log('ENiAC Staking DApp Loading...');
    
    // Setup event listeners
    setupEventListeners();
    
    // Check if already connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        userAddress = window.ethereum.selectedAddress;
        initializeApp();
    }
});

function setupEventListeners() {
    // Connect button
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    
    // Transaction buttons
    document.getElementById('maxBtn').addEventListener('click', setMaxAmount);
    document.getElementById('approveBtn').addEventListener('click', approveTokens);
    document.getElementById('stakeBtn').addEventListener('click', stakeTokens);
    document.getElementById('unstakeBtn').addEventListener('click', unstakeTokens);
    document.getElementById('claimBtn').addEventListener('click', claimRewards);
    
    // Wallet buttons
    document.getElementById('viewWalletBtn').addEventListener('click', viewOtherWallet);
    document.getElementById('copyMyAddressBtn').addEventListener('click', copyMyAddress);
    document.getElementById('viewMyWalletBtn').addEventListener('click', viewMyWallet);
    
    // MetaMask events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                userAddress = accounts[0];
                initializeApp();
            } else {
                resetApp();
            }
        });
    }
}

async function connectWallet() {
    try {
        if (!window.ethereum) {
            showStatus('Please install MetaMask!', 'error');
            return;
        }
        
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        userAddress = accounts[0];
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
        
        // Initialize contracts
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Load data
        await loadData();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showStatus('Initialization error: ' + error.message, 'error');
    }
}

// ============================
// FIXED STAKE FUNCTION
// ============================
async function stakeTokens() {
    try {
        // Check connection
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        // Get amount
        const amountInput = document.getElementById('amountInput');
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
        
        // Disable stake button during transaction
        const stakeBtn = document.getElementById('stakeBtn');
        stakeBtn.disabled = true;
        stakeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Staking...';
        
        // Send transaction with fixed gas settings
        const tx = await masterchefContract.deposit(currentPoolId, amountWei, {
            gasLimit: 500000, // Fixed higher gas limit for BSC
            gasPrice: ethers.utils.parseUnits('5', 'gwei') // 5 gwei for BSC
        });
        
        console.log('Transaction sent:', tx.hash);
        showStatus('Transaction submitted. Waiting for confirmation...', 'info');
        
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
            // Try to decode revert reason
            const revertMatch = error.message.match(/execution reverted: (.*?)(?="|$)/);
            if (revertMatch) {
                errorMsg = `Contract error: ${revertMatch[1]}`;
            } else {
                errorMsg = 'Contract execution reverted';
            }
        } else if (error.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
            errorMsg = 'Transaction may fail. Please check your allowance and try again.';
        }
        
        showStatus(errorMsg, 'error');
        
        // Try pool 0 if current pool fails
        if (currentPoolId !== 0 && error.message.includes('execution reverted')) {
            showStatus('Trying pool 0...', 'info');
            currentPoolId = 0;
            
            try {
                const amountInput = document.getElementById('amountInput');
                const amount = amountInput.value;
                const amountNum = parseFloat(amount);
                const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
                
                const tx = await masterchefContract.deposit(0, amountWei, {
                    gasLimit: 500000,
                    gasPrice: ethers.utils.parseUnits('5', 'gwei')
                });
                
                await tx.wait();
                showStatus(`Successfully staked ${amountNum} ENiAC in pool 0!`, 'success');
                amountInput.value = '';
                await loadData();
            } catch (retryError) {
                console.error('Retry failed:', retryError);
            }
        }
        
    } finally {
        // Re-enable stake button
        const stakeBtn = document.getElementById('stakeBtn');
        stakeBtn.disabled = false;
        stakeBtn.innerHTML = '<i class="fas fa-lock"></i> Stake';
    }
}

// ============================
// APPROVE FUNCTION WITH BETTER ERROR HANDLING
// ============================
async function approveTokens() {
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        const amountInput = document.getElementById('amountInput');
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        showStatus('Approving tokens...', 'info');
        
        // Disable approve button
        const approveBtn = document.getElementById('approveBtn');
        approveBtn.disabled = true;
        approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving...';
        
        // Use specific amount instead of unlimited to avoid issues
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        
        const tx = await eniacContract.approve(CONFIG.MASTERCHEF, amountWei, {
            gasLimit: 100000,
            gasPrice: ethers.utils.parseUnits('5', 'gwei')
        });
        
        showStatus('Approval submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Tokens approved successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Approve error:', error);
        
        let errorMsg = 'Approve failed';
        if (error.code === 4001) {
            errorMsg = 'Transaction rejected by user';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient BNB for gas fees';
        }
        
        showStatus(errorMsg, 'error');
        
    } finally {
        // Re-enable approve button
        const approveBtn = document.getElementById('approveBtn');
        approveBtn.disabled = false;
        approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
    }
}

// ============================
// SIMPLIFIED LOAD DATA
// ============================
async function loadData() {
    if (!userAddress || !eniacContract) return;
    
    try {
        // Load wallet balance
        const balance = await eniacContract.balanceOf(userAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        document.getElementById('walletBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4) + ' ENiAC';
        document.getElementById('availableBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4);
        
        // Load allowance
        const allowance = await eniacContract.allowance(userAddress, CONFIG.MASTERCHEF);
        const allowanceFormatted = ethers.utils.formatUnits(allowance, 18);
        document.getElementById('allowanceAmount').textContent = 
            parseFloat(allowanceFormatted).toFixed(4) + ' ENiAC';
        
        // Update approve button
        const approveBtn = document.getElementById('approveBtn');
        if (parseFloat(allowanceFormatted) > 0) {
            approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
            approveBtn.disabled = true;
            approveBtn.style.background = '#059669';
            document.getElementById('stakeBtn').disabled = false;
        } else {
            approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
            approveBtn.disabled = false;
            approveBtn.style.background = '#10b981';
            document.getElementById('stakeBtn').disabled = true;
        }
        
        // Load staking data
        await loadStakingData();
        
    } catch (error) {
        console.error('Load data error:', error);
    }
}

async function loadStakingData() {
    try {
        // Try pool 0 first
        const userInfo = await masterchefContract.userInfo(0, userAddress);
        const staked = ethers.utils.formatUnits(userInfo.amount, 18);
        
        document.getElementById('stakedAmount').textContent = 
            parseFloat(staked).toFixed(4) + ' ENiAC';
        
        // Load pending rewards
        const pending = await masterchefContract.pendingANT(0, userAddress);
        const pendingFormatted = ethers.utils.formatUnits(pending, 18);
        document.getElementById('pendingRewards').textContent = 
            parseFloat(pendingFormatted).toFixed(4) + ' ENiAC';
        
        // Enable/disable buttons
        document.getElementById('unstakeBtn').disabled = parseFloat(staked) <= 0;
        document.getElementById('claimBtn').disabled = parseFloat(pendingFormatted) <= 0;
        
        // Update current pool ID
        if (parseFloat(staked) > 0) {
            currentPoolId = 0;
        }
        
    } catch (error) {
        console.error('Load staking data error:', error);
        document.getElementById('stakedAmount').textContent = '0 ENiAC';
        document.getElementById('pendingRewards').textContent = '0 ENiAC';
        document.getElementById('unstakeBtn').disabled = true;
        document.getElementById('claimBtn').disabled = true;
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
    
    const balanceText = document.getElementById('walletBalance').textContent;
    const balance = parseFloat(balanceText);
    
    if (!isNaN(balance) && balance > 0) {
        document.getElementById('amountInput').value = balance.toFixed(4);
    }
}

async function unstakeTokens() {
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        const amountInput = document.getElementById('amountInput');
        const amount = amountInput.value;
        const amountNum = parseFloat(amount);
        
        if (!amount || isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount', 'warning');
            return;
        }
        
        showStatus('Unstaking tokens...', 'info');
        
        // Disable button
        const unstakeBtn = document.getElementById('unstakeBtn');
        unstakeBtn.disabled = true;
        unstakeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unstaking...';
        
        const amountWei = ethers.utils.parseUnits(amountNum.toString(), 18);
        const tx = await masterchefContract.withdraw(currentPoolId, amountWei, {
            gasLimit: 500000,
            gasPrice: ethers.utils.parseUnits('5', 'gwei')
        });
        
        showStatus('Unstake submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Tokens unstaked successfully!', 'success');
        amountInput.value = '';
        await loadData();
        
    } catch (error) {
        console.error('Unstake error:', error);
        showStatus('Unstake failed: ' + error.message, 'error');
        
    } finally {
        const unstakeBtn = document.getElementById('unstakeBtn');
        unstakeBtn.disabled = false;
        unstakeBtn.innerHTML = '<i class="fas fa-unlock"></i> Unstake';
    }
}

async function claimRewards() {
    try {
        if (!userAddress) {
            showStatus('Please connect wallet first', 'warning');
            return;
        }
        
        showStatus('Claiming rewards...', 'info');
        
        // Disable button
        const claimBtn = document.getElementById('claimBtn');
        claimBtn.disabled = true;
        claimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Claiming...';
        
        // Withdraw 0 to claim rewards
        const tx = await masterchefContract.withdraw(currentPoolId, 0, {
            gasLimit: 500000,
            gasPrice: ethers.utils.parseUnits('5', 'gwei')
        });
        
        showStatus('Claim submitted. Waiting...', 'info');
        await tx.wait();
        
        showStatus('Rewards claimed successfully!', 'success');
        await loadData();
        
    } catch (error) {
        console.error('Claim error:', error);
        showStatus('Claim failed: ' + error.message, 'error');
        
    } finally {
        const claimBtn = document.getElementById('claimBtn');
        claimBtn.disabled = false;
        claimBtn.innerHTML = '<i class="fas fa-gift"></i> Claim Rewards';
    }
}

// ============================
// UI FUNCTIONS
// ============================
function updateUI() {
    const walletInfo = document.getElementById('walletInfo');
    const connectBtn = document.getElementById('connectBtn');
    
    if (userAddress) {
        const shortAddr = userAddress.substring(0, 6) + '...' + userAddress.substring(userAddress.length - 4);
        walletInfo.innerHTML = `<i class="fas fa-wallet"></i> ${shortAddr}`;
        connectBtn.innerHTML = '<i class="fas fa-check"></i> Connected';
        connectBtn.classList.add('connected');
        
        // Enable inputs
        document.getElementById('maxBtn').disabled = false;
        document.getElementById('amountInput').disabled = false;
        
    } else {
        walletInfo.innerHTML = '<i class="fas fa-wallet"></i> <span>Not Connected</span>';
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect Wallet';
        connectBtn.classList.remove('connected');
        
        // Disable everything
        document.getElementById('maxBtn').disabled = true;
        document.getElementById('approveBtn').disabled = true;
        document.getElementById('stakeBtn').disabled = true;
        document.getElementById('unstakeBtn').disabled = true;
        document.getElementById('claimBtn').disabled = true;
        document.getElementById('amountInput').disabled = true;
        
        clearData();
    }
}

function clearData() {
    document.getElementById('walletBalance').textContent = '0 ENiAC';
    document.getElementById('stakedAmount').textContent = '0 ENiAC';
    document.getElementById('pendingRewards').textContent = '0 ENiAC';
    document.getElementById('allowanceAmount').textContent = '0 ENiAC';
    document.getElementById('availableBalance').textContent = '0';
    document.getElementById('amountInput').value = '';
}

function resetApp() {
    userAddress = null;
    eniacContract = null;
    masterchefContract = null;
    updateUI();
}

// ============================
// WALLET VIEW FUNCTIONS (SIMPLIFIED)
// ============================
async function viewOtherWallet() {
    showStatus('View other wallet feature temporarily disabled', 'info');
}

function viewMyWallet() {
    if (!userAddress) {
        showStatus('Please connect wallet first', 'warning');
        return;
    }
    
    loadData();
    showStatus('Viewing your wallet', 'info');
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

// Test function to check contract connection
async function testContractConnection() {
    try {
        console.log('Testing contract connection...');
        
        // Test ENiAC contract
        const name = await eniacContract.name();
        const symbol = await eniacContract.symbol();
        console.log('ENiAC Token:', name, '(', symbol, ')');
        
        // Test MasterChef contract
        const poolLength = await masterchefContract.poolLength();
        console.log('MasterChef pool length:', poolLength.toString());
        
        // Try to get user info for pool 0
        const userInfo = await masterchefContract.userInfo(0, userAddress);
        console.log('User info for pool 0:', userInfo);
        
        return true;
        
    } catch (error) {
        console.error('Contract test failed:', error);
        return false;
    }
}

// Add test button for debugging
document.addEventListener('DOMContentLoaded', function() {
    const testBtn = document.createElement('button');
    testBtn.innerHTML = '<i class="fas fa-vial"></i> Test Connection';
    testBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #8b5cf6;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 999;
        font-size: 12px;
    `;
    testBtn.onclick = testContractConnection;
    document.body.appendChild(testBtn);
});
