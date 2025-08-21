// script.js - Frontend JavaScript with real API integration

// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://sow-generator-backend-1p9t.onrender.com'; // Replace with your Railway URL

// Global state
let currentTab = 0;
let currentSection = 0;
let aiSections = {};
let sectionKeys = [];
let initialData = null;
let evaluationCriteria = null;

// Categories mapping
const categories = {
    "Supply": ["Open Contract", "Parts Purchase", "Asset Purchase", "Other Supply"],
    "Services": ["Outsourcing (Crusher)", "Technical Services", "Installation", "Inspection", "AMC", "Design, Consultation", "Hiring", "Other Services"],
    "Works": ["Supply + Installation", "Refurbishment", "Projects (CCTV, Fencing)", "Upgrading", "Other Works"]
};

// Utility Functions
function showLoading(element, text = 'Loading...') {
    if (element) {
        element.disabled = true;
        element.innerHTML = `<span class="loading-spinner"></span> ${text}`;
    }
}

function hideLoading(element, originalText) {
    if (element) {
        element.disabled = false;
        element.innerHTML = originalText;
    }
}

async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            // Add authentication headers here if needed
        }
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(url, finalOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Handle different response types
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else if (contentType && contentType.includes('application/octet-stream')) {
            return await response.blob();
        } else {
            return await response.text();
        }
    } catch (error) {
        console.error('API call failed:', error);
        updateApiStatus('error');
        throw error;
    }
}

function updateApiStatus(status) {
    const statusElement = document.getElementById('apiStatus');
    if (statusElement) {
        switch (status) {
            case 'connected':
                statusElement.textContent = '✅ Connected';
                statusElement.style.color = '#28a745';
                break;
            case 'error':
                statusElement.textContent = '❌ Connection Error';
                statusElement.style.color = '#dc3545';
                break;
            default:
                statusElement.textContent = '🔄 Connecting...';
                statusElement.style.color = '#ffc107';
        }
    }
}

// Initialize the application
async function init() {
    try {
        // Test API connection
        await apiCall('/health');
        updateApiStatus('connected');
        
        // Load initial data
        initialData = await apiCall('/initial-data');
        
        // Load departments for Part B
        const departments = await apiCall('/criteria/departments');
        populateSelect('department', departments);
        
        // Load any saved session data
        await loadProgress();
        
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        updateApiStatus('error');
        
        // Fallback to demo mode
        initDemoMode();
    }
}

function initDemoMode() {
    console.log('Running in demo mode (no backend connection)');
    
    // Simulate initial data
    initialData = {
        employees: ["Abdulla Elkawakjy", "Srinivas Ravikumar", "Moorthy", "Abdulaziz Al-Mohsin"],
        departments: ["Operations", "IT", "General Services", "Commercial"],
        contractDurations: ["1YR fixed", "2YR fixed", "3YR fixed", "Others"],
        tradeCategories: ["Electrical & Instrumentation", "Mechanical", "IT Services and Supply", "Others"]
    };
    
    // Populate demo departments
    populateSelect('department', ["Operations", "Commercial", "IT"]);
}

// Tab Management
function showTab(tabIndex) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    const indicators = document.querySelectorAll('.indicator');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    indicators.forEach(ind => ind.classList.remove('active'));
    
    document.getElementById(`tab-${tabIndex}`).classList.add('active');
    buttons[tabIndex].classList.add('active');
    indicators[tabIndex].classList.add('active');
    
    // Mark completed tabs
    for (let i = 0; i < tabIndex; i++) {
        indicators[i].classList.add('completed');
    }
    
    currentTab = tabIndex;
    updateNavigation();
    
    // Update summary and validation when on generate tab
    if (tabIndex === 3) {
        updateSummary();
        updateValidation();
    }
}

function navigateTab(direction) {
    const newTab = currentTab + direction;
    if (newTab >= 0 && newTab <= 3) {
        showTab(newTab);
    }
}

function updateNavigation() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) prevBtn.disabled = currentTab === 0;
    if (nextBtn) nextBtn.disabled = currentTab === 3;
}

// Part A Functions
function updateSubCategory() {
    const sowType = document.getElementById('sowType').value;
    const subCategorySelect = document.getElementById('sowSubCategory');
    
    if (subCategorySelect) {
        subCategorySelect.innerHTML = '<option value="">Select Sub-category</option>';
        
        if (sowType && categories[sowType]) {
            categories[sowType].forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                subCategorySelect.appendChild(option);
            });
        }
    }
}

// Part B Functions
async function loadSowTypes() {
    const department = document.getElementById('department').value;
    if (!department) return;
    
    try {
        const sowTypes = await apiCall(`/criteria/sow-types/${encodeURIComponent(department)}`);
        populateSelect('sowTypeB', sowTypes);
        
        // Clear dependent dropdowns
        clearSelect('includedSections');
        clearSelect('criticalCriteria');
        clearSelect('criticalWeight');
        hideCriteria();
    } catch (error) {
        console.error('Failed to load SOW types:', error);
        // Fallback
        populateSelect('sowTypeB', ['Supply', 'Services', 'Works']);
    }
}

async function loadIncludedSections() {
    const department = document.getElementById('department').value;
    const sowType = document.getElementById('sowTypeB').value;
    if (!department || !sowType) return;
    
    try {
        const sections = await apiCall(`/criteria/included-sections/${encodeURIComponent(department)}/${encodeURIComponent(sowType)}`);
        populateSelect('includedSections', sections);
        
        // Load mandatory requirements
        await loadMandatoryRequirements(sowType);
        
        // Clear dependent dropdowns
        clearSelect('criticalCriteria');
        clearSelect('criticalWeight');
        hideCriteria();
    } catch (error) {
        console.error('Failed to load included sections:', error);
        populateSelect('includedSections', ['Standard', 'Standard + Resources & Personnel Expertise']);
    }
}

async function loadCriticalCriteria() {
    const department = document.getElementById('department').value;
    const sowType = document.getElementById('sowTypeB').value;
    const includedSections = document.getElementById('includedSections').value;
    if (!department || !sowType || !includedSections) return;
    
    try {
        const criteria = await apiCall(`/criteria/critical/${encodeURIComponent(department)}/${encodeURIComponent(sowType)}/${encodeURIComponent(includedSections)}`);
        populateSelect('criticalCriteria', criteria);
        
        // Clear dependent dropdowns
        clearSelect('criticalWeight');
        hideCriteria();
    } catch (error) {
        console.error('Failed to load critical criteria:', error);
        populateSelect('criticalCriteria', ['Technical Compliance and Quality', 'Commercial Evaluation']);
    }
}

async function loadCriticalWeights() {
    const department = document.getElementById('department').value;
    const sowType = document.getElementById('sowTypeB').value;
    const includedSections = document.getElementById('includedSections').value;
    const criticalCriteria = document.getElementById('criticalCriteria').value;
    if (!department || !sowType || !includedSections || !criticalCriteria) return;
    
    try {
        const weights = await apiCall(`/criteria/weights/${encodeURIComponent(department)}/${encodeURIComponent(sowType)}/${encodeURIComponent(includedSections)}/${encodeURIComponent(criticalCriteria)}`);
        populateSelect('criticalWeight', weights.map(w => `${w}%`));
        
        hideCriteria();
    } catch (error) {
        console.error('Failed to load critical weights:', error);
        populateSelect('criticalWeight', ['70%', '80%']);
    }
}

async function loadEvaluationCriteria() {
    const department = document.getElementById('department').value;
    const sowType = document.getElementById('sowTypeB').value;
    const includedSections = document.getElementById('includedSections').value;
    const criticalCriteria = document.getElementById('criticalCriteria').value;
    const criticalWeight = document.getElementById('criticalWeight').value.replace('%', '');
    
    if (!department || !sowType || !includedSections || !criticalCriteria || !criticalWeight) return;
    
    try {
        evaluationCriteria = await apiCall(`/criteria/evaluation/${encodeURIComponent(department)}/${encodeURIComponent(sowType)}/${encodeURIComponent(includedSections)}/${encodeURIComponent(criticalCriteria)}/${encodeURIComponent(criticalWeight)}`);
        displayCriteria(evaluationCriteria);
    } catch (error) {
        console.error('Failed to load evaluation criteria:', error);
        // Show demo criteria
        displayDemoCriteria();
    }
}

async function loadMandatoryRequirements(sowType) {
    try {
        const requirements = await apiCall(`/mandatory-requirements/${encodeURIComponent(sowType)}`);
        displayMandatoryRequirements(requirements);
    } catch (error) {
        console.error('Failed to load mandatory requirements:', error);
        // Show demo requirements
        displayMandatoryRequirements([
            'Valid commercial registration',
            'ISO 9001:2015 certification',
            'Minimum 1 year warranty',
            'Local representative in Qatar'
        ]);
    }
}

function displayCriteria(criteria) {
    const container = document.getElementById('criteriaContent');
    const display = document.getElementById('criteriaDisplay');
    
    if (!container || !display) return;
    
    let html = '';
    
    Object.entries(criteria).forEach(([sectionName, sectionData]) => {
        html += `<div class="criterion-item">
            <h4>📂 ${sectionName}</h4>`;
        
        Object.entries(sectionData).forEach(([criterionName, criterionData]) => {
            html += `<div style="margin-bottom: 20px;">
                <h5>📋 ${criterionName} (${criterionData.criterion_weight}%)</h5>`;
            
            criterionData.categories.forEach((category, index) => {
                html += `<div class="category-row">
                    <input type="text" class="form-control category-input" 
                           value="${category.category}" 
                           onchange="updateCategory('${sectionName}', '${criterionName}', ${index}, this.value)">
                    <span class="weight-display">${category.category_weight}%</span>
                </div>`;
            });
            
            html += '</div>';
        });
        
        html += '</div>';
    });
    
    container.innerHTML = html;
    display.style.display = 'block';
    display.scrollIntoView({ behavior: 'smooth' });
}

function displayDemoCriteria() {
    const container = document.getElementById('criteriaContent');
    const display = document.getElementById('criteriaDisplay');
    
    if (!container || !display) return;
    
    const demoHtml = `
        <div class="criterion-item">
            <h4>📂 Technical Specifications</h4>
            <div style="margin-bottom: 20px;">
                <h5>📋 Product Quality Standards (25%)</h5>
                <div class="category-row">
                    <input type="text" class="form-control category-input" value="Material compliance with international standards">
                    <span class="weight-display">10%</span>
                </div>
                <div class="category-row">
                    <input type="text" class="form-control category-input" value="Quality certifications (ISO, CE, etc.)">
                    <span class="weight-display">8%</span>
                </div>
                <div class="category-row">
                    <input type="text" class="form-control category-input" value="Testing and inspection reports">
                    <span class="weight-display">7%</span>
                </div>
            </div>
        </div>`;
    
    container.innerHTML = demoHtml;
    display.style.display = 'block';
}

function displayMandatoryRequirements(requirements) {
    const container = document.getElementById('mandatoryRequirements');
    if (!container) return;
    
    let html = '<div style="margin-top: 15px;">';
    
    requirements.forEach((req, index) => {
        html += `
            <label class="checkbox-label">
                <input type="checkbox" id="req-${index}" value="${req}">
                ${req}
            </label>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function hideCriteria() {
    const display = document.getElementById('criteriaDisplay');
    if (display) display.style.display = 'none';
}

// Part C Functions
async function generateAIDraft() {
    const sowType = document.getElementById('sowType').value;
    const sowSubCategory = document.getElementById('sowSubCategory').value;
    const sowTitle = document.getElementById('sowTitle').value;
    const briefDescription = document.getElementById('briefDescription').value;
    const contractDuration = document.getElementById('contractDuration').value;
    const userInstructions = document.getElementById('userInstructions').value;
    
    if (!sowType || !sowSubCategory || !sowTitle || !briefDescription) {
        alert('Please fill in all required fields');
        return;
    }
    
    const generateBtn = document.querySelector('#tab-2 .btn-primary');
    showLoading(generateBtn, 'Generating...');
    
    try {
        const response = await apiCall('/generate-draft', {
            method: 'POST',
            body: JSON.stringify({
                sowType,
                sowSubCategory,
                sowTitle,
                briefDescription,
                contractDuration,
                userInstructions
            })
        });
        
        if (response.sections) {
            aiSections = response.sections;
            sectionKeys = Object.keys(aiSections);
            currentSection = 0;
            
            displayAIContent();
            
            if (response.questions && response.questions.length > 0) {
                displayAIQuestions(response.questions);
            }
        }
        
    } catch (error) {
        console.error('Failed to generate AI draft:', error);
        // Show demo content
        generateDemoContent();
    } finally {
        hideLoading(generateBtn, 'Generate Draft');
    }
}

function generateDemoContent() {
    aiSections = {
        "section1_placeholder": {
            title: "1. Introduction and Scope",
            content: "This section outlines the comprehensive scope of work for the supply of electrical equipment..."
        },
        "section2_placeholder": {
            title: "2. Technical Specifications", 
            content: "All equipment and materials shall conform to the following technical specifications..."
        }
    };
    
    sectionKeys = Object.keys(aiSections);
    currentSection = 0;
    displayAIContent();
    
    displayAIQuestions([
        "Specify voltage requirements and electrical standards",
        "Define delivery timeline and milestones",
        "Clarify installation and commissioning requirements"
    ]);
}

function displayAIContent() {
    const aiContent = document.getElementById('aiContent');
    if (!aiContent) return;
    
    aiContent.style.display = 'block';
    updateSectionDisplay();
    aiContent.scrollIntoView({ behavior: 'smooth' });
}

function displayAIQuestions(questions) {
    const container = document.getElementById('questionsContent');
    const feedback = document.getElementById('aiQuestions');
    
    if (container && feedback) {
        let html = '<p>To improve the draft, add the following details to the description:</p><ol>';
        questions.forEach(question => {
            html += `<li>${question}</li>`;
        });
        html += '</ol><p>You can add the required details to the description and generate a new draft.</p>';
        
        container.innerHTML = html;
        feedback.style.display = 'block';
    }
}

function navigateSection(direction) {
    const newSection = currentSection + direction;
    if (newSection >= 0 && newSection < sectionKeys.length) {
        // Save current section content
        saveCurrentSectionContent();
        currentSection = newSection;
        updateSectionDisplay();
    }
}

function saveCurrentSectionContent() {
    const editor = document.getElementById('sectionEditor');
    if (editor && sectionKeys[currentSection]) {
        const key = sectionKeys[currentSection];
        if (aiSections[key]) {
            aiSections[key].content = editor.value;
        }
    }
}

function updateSectionDisplay() {
    if (sectionKeys.length === 0) return;
    
    const key = sectionKeys[currentSection];
    const section = aiSections[key];
    
    if (section) {
        document.getElementById('sectionTitle').textContent = section.title;
        document.getElementById('sectionStatus').textContent = `Section ${currentSection + 1} of ${sectionKeys.length}`;
        document.getElementById('sectionEditor').value = section.content;
    }
    
    // Update navigation buttons
    const prevBtn = document.getElementById('prevSection');
    const nextBtn = document.getElementById('nextSection');
    
    if (prevBtn) prevBtn.disabled = currentSection === 0;
    if (nextBtn) nextBtn.disabled = currentSection >= sectionKeys.length - 1;
}

// File Upload Functions
async function uploadBoq() {
    const fileInput = document.getElementById('boqFile');
    const statusElement = document.getElementById('boqStatus');
    
    if (!fileInput.files[0]) return;
    
    const formData = new FormData();
    formData.append('boq', fileInput.files[0]);
    
    try {
        await apiCall('/upload/boq', {
            method: 'POST',
            body: formData,
            headers: {} // Don't set Content-Type for FormData
        });
        
        if (statusElement) {
            statusElement.textContent = `✅ Uploaded: ${fileInput.files[0].name}`;
            statusElement.className = 'status-message status-success';
        }
    } catch (error) {
        console.error('Failed to upload BoQ:', error);
        if (statusElement) {
            statusElement.textContent = '❌ Upload failed';
            statusElement.className = 'status-message status-error';
        }
    }
}

async function uploadImages() {
    const fileInput = document.getElementById('imageFiles');
    const statusElement = document.getElementById('imageStatus');
    
    if (!fileInput.files.length) return;
    
    const formData = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('images', fileInput.files[i]);
    }
    
    try {
        await apiCall('/upload/images', {
            method: 'POST',
            body: formData,
            headers: {} // Don't set Content-Type for FormData
        });
        
        if (statusElement) {
            statusElement.textContent = `✅ Uploaded ${fileInput.files.length} image(s)`;
            statusElement.className = 'status-message status-success';
        }
    } catch (error) {
        console.error('Failed to upload images:', error);
        if (statusElement) {
            statusElement.textContent = '❌ Upload failed';
            statusElement.className = 'status-message status-error';
        }
    }
}

// Session Management
async function saveProgress() {
    const sessionData = {
        partA: getFormData('partA'),
        partB: getFormData('partB'),
        partC: getFormData('partC'),
        aiSections: aiSections,
        currentSection: currentSection,
        evaluationCriteria: evaluationCriteria
    };
    
    try {
        await apiCall('/session/save', {
            method: 'POST',
            body: JSON.stringify({ section: 'all', data: sessionData })
        });
        
        showNotification('Progress saved successfully!', 'success');
    } catch (error) {
        console.error('Failed to save progress:', error);
        showNotification('Failed to save progress', 'error');
    }
}

async function loadProgress() {
    try {
        const sessionData = await apiCall('/session/get');
        
        if (sessionData && Object.keys(sessionData).length > 0) {
            // Restore form data
            if (sessionData.partA) setFormData('partA', sessionData.partA);
            if (sessionData.partB) setFormData('partB', sessionData.partB);
            if (sessionData.partC) setFormData('partC', sessionData.partC);
            
            // Restore AI sections
            if (sessionData.aiSections) {
                aiSections = sessionData.aiSections;
                sectionKeys = Object.keys(aiSections);
                currentSection = sessionData.currentSection || 0;
                
                if (sectionKeys.length > 0) {
                    displayAIContent();
                }
            }
            
            // Restore evaluation criteria
            if (sessionData.evaluationCriteria) {
                evaluationCriteria = sessionData.evaluationCriteria;
                displayCriteria(evaluationCriteria);
            }
            
            showNotification('Progress loaded successfully!', 'success');
        }
    } catch (error) {
        console.error('Failed to load progress:', error);
        // Don't show error for this as it's expected on first load
    }
}

async function clearSession() {
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall('/session/clear', { method: 'POST' });
        
        // Clear form data
        document.querySelectorAll('input, select, textarea').forEach(element => {
            if (element.type === 'checkbox' || element.type === 'radio') {
                element.checked = false;
            } else {
                element.value = '';
            }
        });
        
        // Reset state
        aiSections = {};
        sectionKeys = [];
        currentSection = 0;
        evaluationCriteria = null;
        
        // Hide dynamic content
        document.getElementById('aiContent').style.display = 'none';
        document.getElementById('criteriaDisplay').style.display = 'none';
        
        // Go to first tab
        showTab(0);
        
        showNotification('All data cleared successfully!', 'success');
    } catch (error) {
        console.error('Failed to clear session:', error);
        showNotification('Failed to clear data', 'error');
    }
}

// Document Generation
async function generateDocument() {
    // Validate required fields
    if (!validateFormData()) {
        showNotification('Please complete all required fields', 'error');
        return;
    }
    
    const generateBtn = document.getElementById('generateDocBtn');
    showLoading(generateBtn, 'Generating Document...');
    
    // Save current section content before generating
    saveCurrentSectionContent();
    
    const formData = {
        // Part A data
        ...getFormData('partA'),
        
        // Part C data
        ...getFormData('partC'),
        
        // AI sections
        aiSections: aiSections,
        
        // Mandatory requirements
        selectedMandatoryReqs: getSelectedMandatoryRequirements(),
        
        // Evaluation criteria
        evaluationCriteria: evaluationCriteria
    };
    
    try {
        const blob = await apiCall('/generate-document', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        // Download the file
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SOW_${new Date().toISOString().slice(0, 10)}.docx`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        showNotification('Document generated successfully!', 'success');
        
    } catch (error) {
        console.error('Failed to generate document:', error);
        showNotification('Failed to generate document', 'error');
        
        // Fallback: show demo download
        const link = document.createElement('a');
        link.href = 'data:text/plain;charset=utf-8,This is a demo SOW document generated by the AI SOW Generator.';
        link.download = `SOW_Demo_${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        
    } finally {
        hideLoading(generateBtn, 'Generate Final SOW Document');
    }
}

// Summary and Validation
function updateSummary() {
    const container = document.getElementById('summaryContent');
    if (!container) return;
    
    const partAData = getFormData('partA');
    const partCData = getFormData('partC');
    
    const summaryItems = [
        { label: 'SOW Type', value: partAData.sowType || 'Not selected' },
        { label: 'Sub-category', value: partAData.sowSubCategory || 'Not selected' },
        { label: 'Title', value: partCData.sowTitle || 'Not entered' },
        { label: 'Requestor', value: partAData.requestorName || 'Not selected' },
        { label: 'Department', value: partAData.requestingDept || 'Not selected' },
        { label: 'Contract Value', value: getSelectedRadioValue('contractValue') || 'Not selected' },
        { label: 'Contract Duration', value: partAData.contractDuration || 'Not selected' },
        { label: 'Sections Generated', value: sectionKeys.length.toString() },
        { label: 'Mandatory Requirements', value: getSelectedMandatoryRequirements().length.toString() },
        { label: 'BoQ File', value: document.getElementById('boqFile')?.files[0]?.name || 'None' },
        { label: 'Images', value: `${document.getElementById('imageFiles')?.files.length || 0} file(s)` }
    ];
    
    const html = summaryItems.map(item => `
        <div class="summary-item">
            <strong>${item.label}:</strong> ${item.value}
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function updateValidation() {
    const container = document.getElementById('validationContent');
    if (!container) return;
    
    const partAValid = validatePartA();
    const partCValid = sectionKeys.length > 0;
    const allValid = partAValid && partCValid;
    
    const validationItems = [
        {
            label: 'Part A - Basic Information',
            valid: partAValid,
            icon: partAValid ? '✓' : '✗',
            status: partAValid ? 'valid' : 'invalid'
        },
        {
            label: 'Part B - Evaluation Criteria',
            valid: true, // Optional
            icon: '✓',
            status: 'valid'
        },
        {
            label: 'Part C - AI Content Generated',
            valid: partCValid,
            icon: partCValid ? '✓' : '✗',
            status: partCValid ? 'valid' : 'invalid'
        }
    ];
    
    const html = validationItems.map(item => `
        <div class="validation-item ${item.status}">
            <span class="status-icon ${item.status}">${item.icon}</span>
            ${item.label}
        </div>
    `).join('');
    
    container.innerHTML = html;
    
    // Enable/disable generate button
    const generateBtn = document.getElementById('generateDocBtn');
    if (generateBtn) {
        generateBtn.disabled = !allValid;
    }
}

// Utility Functions
function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = `<option value="">Select ${selectId.replace(/([A-Z])/g, ' $1')}</option>`;
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        select.appendChild(optionElement);
    });
    
    // Restore previous value if it exists in new options
    if (currentValue && options.includes(currentValue)) {
        select.value = currentValue;
    }
}

function clearSelect(selectId) {
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = `<option value="">Select ${selectId.replace(/([A-Z])/g, ' $1')}</option>`;
    }
}

function getFormData(section) {
    const data = {};
    const container = document.getElementById(`tab-${section === 'partA' ? '0' : section === 'partB' ? '1' : '2'}`);
    
    if (container) {
        const inputs = container.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'radio') {
                if (input.checked) {
                    data[input.name] = input.value;
                }
            } else if (input.type === 'checkbox') {
                if (!data[input.name]) data[input.name] = [];
                if (input.checked) {
                    data[input.name].push(input.value);
                }
            } else {
                data[input.id] = input.value;
            }
        });
    }
    
    return data;
}

function setFormData(section, data) {
    const container = document.getElementById(`tab-${section === 'partA' ? '0' : section === 'partB' ? '1' : '2'}`);
    
    if (container && data) {
        Object.entries(data).forEach(([key, value]) => {
            const element = container.querySelector(`#${key}, [name="${key}"]`);
            
            if (element) {
                if (element.type === 'radio') {
                    const radio = container.querySelector(`[name="${key}"][value="${value}"]`);
                    if (radio) radio.checked = true;
                } else if (element.type === 'checkbox') {
                    if (Array.isArray(value)) {
                        value.forEach(val => {
                            const checkbox = container.querySelector(`[name="${key}"][value="${val}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                } else {
                    element.value = value;
                }
            }
        });
    }
}

function getSelectedRadioValue(name) {
    const radio = document.querySelector(`input[name="${name}"]:checked`);
    return radio ? radio.value : null;
}

function getSelectedMandatoryRequirements() {
    const checkboxes = document.querySelectorAll('#mandatoryRequirements input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function validatePartA() {
    const requiredFields = ['sowType', 'sowSubCategory', 'requestorName', 'requestingDept'];
    const requiredRadios = ['contractValue', 'docType', 'contractType', 'awardType', 'pricingStrategy', 'paymentTerms'];
    
    // Check required input fields
    for (const field of requiredFields) {
        const element = document.getElementById(field);
        if (!element || !element.value.trim()) {
            return false;
        }
    }
    
    // Check required radio groups
    for (const radio of requiredRadios) {
        if (!getSelectedRadioValue(radio)) {
            return false;
        }
    }
    
    return true;
}

function validateFormData() {
    const partCData = getFormData('partC');
    return validatePartA() && 
           partCData.sowTitle && 
           partCData.briefDescription && 
           sectionKeys.length > 0;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `status-message status-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    init();
    
    // Set up navigation
    updateNavigation();
    
    // Auto-save functionality
    let saveTimeout;
    document.addEventListener('input', function() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveProgress, 30000); // Auto-save every 30 seconds
    });
    
    // Add keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    navigateTab(-1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    navigateTab(1);
                    break;
                case 's':
                    e.preventDefault();
                    saveProgress();
                    break;
            }
        }
    });
    
    // Update section content when typing
    const sectionEditor = document.getElementById('sectionEditor');
    if (sectionEditor) {
        sectionEditor.addEventListener('input', function() {
            saveCurrentSectionContent();
        });
    }
});

// Make functions globally available
window.showTab = showTab;
window.navigateTab = navigateTab;
window.updateSubCategory = updateSubCategory;
window.loadSowTypes = loadSowTypes;
window.loadIncludedSections = loadIncludedSections;
window.loadCriticalCriteria = loadCriticalCriteria;
window.loadCriticalWeights = loadCriticalWeights;
window.loadEvaluationCriteria = loadEvaluationCriteria;
window.generateAIDraft = generateAIDraft;
window.navigateSection = navigateSection;
window.uploadBoq = uploadBoq;
window.uploadImages = uploadImages;
window.saveProgress = saveProgress;
window.loadProgress = loadProgress;
window.clearSession = clearSession;
window.generateDocument = generateDocument;
