/**
 * Task Manager Application
 * A simple, accessible task management application with localStorage persistence
 */

(function() {
    'use strict';

// ======================
// State Management
// ======================

let tasks = [];
let currentFilter = 'all'; // 'all', 'active', or 'completed'
let isDarkMode = false;
let deletedTask = null; // Store deleted task for undo functionality
let undoTimeout = null; // Track undo timeout

// ======================
// Constants
// ======================

const ANIMATION_DURATION = 300; // milliseconds - matches CSS animation duration

// ======================
// Utility Functions
// ======================

/**
 * Generate a unique task ID using timestamp and random component
 * Format: timestamp_randomString (e.g., 1738560000000_a7b3f9)
 * This ensures uniqueness across sessions and browsers
 */
function generateTaskId() {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${randomStr}`;
}

/**
 * Sanitize user input to prevent XSS attacks
 * Removes HTML tags and encodes special characters
 */
function sanitizeInput(input) {
    // Create a temporary element to leverage browser's built-in text encoding
    const temp = document.createElement('div');
    temp.textContent = input;
    return temp.innerHTML;
}

// ======================
// DOM Elements
// ======================

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const totalTasks = document.getElementById('totalTasks');
const activeTasks = document.getElementById('activeTasks');
const completedTasks = document.getElementById('completedTasks');
const filterButtons = document.querySelectorAll('.filter-button');
const darkModeToggle = document.getElementById('darkModeToggle');

// ======================
// Task Class
// ======================

class Task {
    constructor(text, id = null, dueDate = null) {
        this.id = id || generateTaskId();
        this.text = text;
        this.completed = false;
        this.createdAt = new Date().toISOString();
        this.dueDate = dueDate; // Format: YYYY-MM-DD
        this.dateCompleted = null; // Auto-set on completion
    }

    toggle() {
        this.completed = !this.completed;
        if (this.completed) {
            this.dateCompleted = new Date().toISOString();
        } else {
            this.dateCompleted = null;
        }
    }
    
    setDueDate(date) {
        this.dueDate = date;
    }
    
    isOverdue() {
        if (!this.dueDate || this.completed) return false;
        const today = new Date().toISOString().split('T')[0];
        return this.dueDate < today;
    }
    
    isDueToday() {
        if (!this.dueDate) return false;
        const today = new Date().toISOString().split('T')[0];
        return this.dueDate === today;
    }
}

// ======================
// Initialization
// ======================

function init() {
    loadTasks();
    loadDarkModePreference();
    renderTasks();
    updateStats();
    attachEventListeners();
    initDatesFeature();
}

// ======================
// Event Listeners
// ======================

function attachEventListeners() {
    taskForm.addEventListener('submit', handleAddTask);
    
    // Filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');
            setFilter(filter);
        });
    });
    
    // Dark mode toggle
    darkModeToggle.addEventListener('click', toggleDarkMode);
}

// ======================
// Task Operations
// ======================

/**
 * Handle adding a new task
 * Validates input to prevent empty tasks and trims whitespace
 */
function handleAddTask(e) {
    e.preventDefault();
    
    const text = taskInput.value.trim();
    
    if (!text) {
        return;
    }
    
    // Sanitize input to prevent XSS attacks
    const sanitizedText = sanitizeInput(text);
    
    const task = new Task(sanitizedText);
    tasks.push(task);
    
    // Clear input and refocus
    taskInput.value = '';
    taskInput.focus();
    
    // Update UI and save
    addTaskToDOM(task);
    updateStats();
    saveTasks();
    
    // Announce to screen readers
    announceToScreenReader(`Task "${sanitizedText}" added`);
}

/**
 * Toggle task completion status
 */
function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    
    if (task) {
        task.toggle();
        updateTaskInDOM(task);
        updateStats();
        saveTasks();
        
        const status = task.completed ? 'completed' : 'uncompleted';
        announceToScreenReader(`Task marked as ${status}`);
    }
}

/**
 * Delete a task
 */
function deleteTask(id) {
    const taskIndex = tasks.findIndex(t => t.id === id);
    
    if (taskIndex !== -1) {
        const taskText = tasks[taskIndex].text;
        
        // Store deleted task for undo
        deletedTask = {
            task: tasks[taskIndex],
            index: taskIndex
        };
        
        tasks.splice(taskIndex, 1);
        
        removeTaskFromDOM(id);
        updateStats();
        saveTasks();
        
        // Show undo notification
        showNotification(
            `Task "${taskText}" deleted`,
            'info',
            5000,
            () => undoDelete()
        );
        
        announceToScreenReader(`Task "${taskText}" deleted`);
        
        // Clear deleted task after undo window expires
        if (undoTimeout) {
            clearTimeout(undoTimeout);
        }
        undoTimeout = setTimeout(() => {
            deletedTask = null;
        }, 5000);
    }
}

/**
 * Restore a deleted task (undo)
 */
function undoDelete() {
    if (!deletedTask) {
        return;
    }
    
    if (undoTimeout) {
        clearTimeout(undoTimeout);
    }
    
    // Restore task to its original position
    tasks.splice(deletedTask.index, 0, deletedTask.task);
    
    // Re-render the list to restore task
    renderTasks();
    updateStats();
    saveTasks();
    
    announceToScreenReader(`Task "${deletedTask.task.text}" restored`);
    
    deletedTask = null;
    undoTimeout = null;
}

// ======================
// Rendering
// ======================

/**
 * Render all tasks to the DOM
 */
function renderTasks() {
    // Clear the task list
    taskList.innerHTML = '';
    
    // Filter tasks based on current filter
    const filteredTasks = getFilteredTasks();
    
    // Show empty state if no tasks match filter
    if (filteredTasks.length === 0) {
        emptyState.classList.add('empty-state--visible');
        updateEmptyStateMessage();
        return;
    }
    
    emptyState.classList.remove('empty-state--visible');
    
    // Render each filtered task
    filteredTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        taskList.appendChild(taskElement);
    });
}

/**
 * Create a task DOM element
 */
function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'task-item--completed' : ''}`;
    li.setAttribute('data-task-id', task.id);
    
    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-item__checkbox';
    checkbox.checked = task.completed;
    checkbox.id = `task-${task.id}`;
    checkbox.setAttribute('aria-label', `Mark task "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', () => toggleTask(task.id));
    
    // Task text label
    const label = document.createElement('label');
    label.className = 'task-item__text';
    label.htmlFor = `task-${task.id}`;
    label.textContent = task.text;
    
    // Date badge or button
    const dateContainer = document.createElement('span');
    dateContainer.className = 'task-date-container';
    
    if (task.dueDate) {
        const dateBadge = document.createElement('button');
        dateBadge.className = 'task-date-badge';
        
        // Determine badge class based on due date
        if (task.completed) {
            // Completed tasks don't show overdue/today styling
        } else if (task.isOverdue && task.isOverdue()) {
            dateBadge.classList.add('task-date-badge--overdue');
        } else if (task.isDueToday && task.isDueToday()) {
            dateBadge.classList.add('task-date-badge--today');
        } else {
            dateBadge.classList.add('task-date-badge--future');
        }
        
        dateBadge.textContent = formatDate(task.dueDate);
        dateBadge.title = 'Click to edit due date';
        dateBadge.setAttribute('aria-label', `Due date: ${formatDate(task.dueDate)}. Click to edit`);
        dateBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            openDatePickerForTask(task.id);
        });
        dateContainer.appendChild(dateBadge);
    } else {
        const addDateBtn = document.createElement('button');
        addDateBtn.className = 'task-date-btn';
        addDateBtn.innerHTML = '📅 Add Date';
        addDateBtn.title = 'Add due date';
        addDateBtn.setAttribute('aria-label', 'Add due date to task');
        addDateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDatePickerForTask(task.id);
        });
        dateContainer.appendChild(addDateBtn);
    }
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-item__delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.setAttribute('aria-label', `Delete task "${task.text}"`);
    deleteBtn.addEventListener('click', () => {
        // Add animation before deleting
        li.style.animation = `slideOut ${ANIMATION_DURATION}ms ease-out`;
        setTimeout(() => deleteTask(task.id), ANIMATION_DURATION);
    });
    
    // Assemble the task item
    li.appendChild(checkbox);
    li.appendChild(label);
    li.appendChild(dateContainer);
    li.appendChild(deleteBtn);
    
    return li;
}

/**
 * Add a task to the DOM (optimized - no full rebuild)
 */
function addTaskToDOM(task) {
    // Check if task should be visible with current filter
    const filteredTasks = getFilteredTasks();
    const shouldShow = filteredTasks.some(t => t.id === task.id);
    
    if (!shouldShow) {
        return;
    }
    
    // Hide empty state if visible
    if (emptyState.classList.contains('empty-state--visible')) {
        emptyState.classList.remove('empty-state--visible');
    }
    
    const taskElement = createTaskElement(task);
    taskList.appendChild(taskElement);
}

/**
 * Update a task in the DOM (optimized - no full rebuild)
 */
function updateTaskInDOM(task) {
    const taskElement = taskList.querySelector(`[data-task-id="${task.id}"]`);
    
    if (!taskElement) {
        return;
    }
    
    // Check if task should still be visible with current filter
    const filteredTasks = getFilteredTasks();
    const shouldShow = filteredTasks.some(t => t.id === task.id);
    
    if (!shouldShow) {
        // Task no longer matches filter, remove it
        taskElement.remove();
        // Check if we need to show empty state
        if (taskList.children.length === 0) {
            emptyState.classList.add('empty-state--visible');
            updateEmptyStateMessage();
        }
        return;
    }
    
    // Update task element
    const checkbox = taskElement.querySelector('.task-item__checkbox');
    const label = taskElement.querySelector('.task-item__text');
    
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark task "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`);
    
    if (task.completed) {
        taskElement.classList.add('task-item--completed');
    } else {
        taskElement.classList.remove('task-item--completed');
    }
}

/**
 * Remove a task from the DOM (optimized - no full rebuild)
 */
function removeTaskFromDOM(id) {
    const taskElement = taskList.querySelector(`[data-task-id="${id}"]`);
    
    if (taskElement) {
        taskElement.remove();
    }
    
    // Show empty state if no tasks remain
    if (taskList.children.length === 0) {
        emptyState.classList.add('empty-state--visible');
        updateEmptyStateMessage();
    }
}

/**
 * Update task statistics
 */
function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    
    totalTasks.textContent = total;
    activeTasks.textContent = active;
    completedTasks.textContent = completed;
}

// ======================
// Filtering
// ======================

/**
 * Set the current filter and update UI
 */
function setFilter(filter) {
    currentFilter = filter;
    
    // Update active button state
    filterButtons.forEach(button => {
        if (button.getAttribute('data-filter') === filter) {
            button.classList.add('filter-button--active');
            button.setAttribute('aria-pressed', 'true');
        } else {
            button.classList.remove('filter-button--active');
            button.setAttribute('aria-pressed', 'false');
        }
    });
    
    // Re-render tasks with new filter
    renderTasks();
    
    // Announce filter change
    announceToScreenReader(`Showing ${filter} tasks`);
}

/**
 * Get filtered tasks based on current filter
 */
function getFilteredTasks() {
    switch (currentFilter) {
        case 'active':
            return tasks.filter(task => !task.completed);
        case 'completed':
            return tasks.filter(task => task.completed);
        case 'all':
        default:
            return tasks;
    }
}

/**
 * Update empty state message based on current filter
 */
function updateEmptyStateMessage() {
    const emptyStateText = emptyState.querySelector('.empty-state__text');
    
    if (tasks.length === 0) {
        emptyStateText.textContent = 'No tasks yet. Add one to get started!';
    } else if (currentFilter === 'active') {
        emptyStateText.textContent = 'No active tasks. Great job!';
    } else if (currentFilter === 'completed') {
        emptyStateText.textContent = 'No completed tasks yet.';
    }
}

// ======================
// Local Storage
// ======================

/**
 * Save tasks to localStorage
 */
function saveTasks() {
    try {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    } catch (error) {
        console.error('Failed to save tasks to localStorage:', error);
        showNotification(
            'Unable to save tasks. You may be in private browsing mode or storage quota is exceeded.',
            'error'
        );
    }
}

/**
 * Load tasks from localStorage
 */
function loadTasks() {
    try {
        const savedTasks = localStorage.getItem('tasks');
        
        if (savedTasks) {
            const parsedTasks = JSON.parse(savedTasks);
            // Recreate Task instances from plain objects
            tasks = parsedTasks.map(taskData => {
                const task = new Task(taskData.text, taskData.id, taskData.dueDate);
                task.completed = taskData.completed;
                task.createdAt = taskData.createdAt;
                task.dateCompleted = taskData.dateCompleted;
                return task;
            });
        } else {
            // Initialize with sample tasks for demo purposes
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            tasks = [
                new Task('Review project proposals', null, yesterday.toISOString().split('T')[0]),
                new Task('Submit quarterly report', null, today.toISOString().split('T')[0]),
                new Task('Code review for feature X', null, tomorrow.toISOString().split('T')[0]),
                new Task('Update documentation', null, nextWeek.toISOString().split('T')[0]),
                new Task('Team meeting preparation'),
                new Task('Brainstorm new ideas')
            ];
            tasks[4].toggle(); // Mark one as completed
            saveTasks();
        }
        
        // Clean up old taskIdCounter from localStorage (legacy)
        if (localStorage.getItem('taskIdCounter')) {
            localStorage.removeItem('taskIdCounter');
        }
    } catch (error) {
        console.error('Failed to load tasks from localStorage:', error);
        showNotification(
            'Unable to load saved tasks. Starting with a fresh task list.',
            'error'
        );
        tasks = [];
    }
}

// ======================
// Accessibility
// ======================

/**
 * Announce messages to screen readers
 */
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'visually-hidden';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

/**
 * Show a notification to the user
 */
function showNotification(message, type = 'error', duration = 5000, actionCallback = null) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    
    const icon = document.createElement('span');
    icon.className = 'notification__icon';
    icon.textContent = type === 'info' ? 'ℹ️' : '⚠️';
    icon.setAttribute('aria-hidden', 'true');
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification__message';
    messageSpan.textContent = message;
    
    notification.appendChild(icon);
    notification.appendChild(messageSpan);
    
    // Add action button if callback provided
    if (actionCallback) {
        const actionButton = document.createElement('button');
        actionButton.className = 'notification__action';
        actionButton.textContent = 'Undo';
        actionButton.setAttribute('aria-label', 'Undo deletion');
        actionButton.addEventListener('click', () => {
            actionCallback();
            notification.classList.remove('notification--visible');
            setTimeout(() => {
                notification.remove();
            }, 300);
        });
        notification.appendChild(actionButton);
    }
    
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.classList.add('notification--visible');
    }, 10);
    
    // Auto-dismiss after duration
    setTimeout(() => {
        notification.classList.remove('notification--visible');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

// ======================
// Keyboard Shortcuts
// ======================

document.addEventListener('keydown', (e) => {
    // Focus input when pressing '/' key
    if (e.key === '/' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        taskInput.focus();
    }
});

// ======================
// Dark Mode
// ======================

/**
 * Toggle dark mode on/off
 */
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    applyDarkMode();
    saveDarkModePreference();
}

/**
 * Apply dark mode class to body and update icon
 */
function applyDarkMode() {
    const iconElement = darkModeToggle.querySelector('.dark-mode-toggle__icon');
    
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        iconElement.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-mode');
        iconElement.textContent = '🌙';
    }
}

/**
 * Save dark mode preference to localStorage
 */
function saveDarkModePreference() {
    try {
        localStorage.setItem('darkMode', isDarkMode.toString());
    } catch (error) {
        console.error('Failed to save dark mode preference:', error);
        showNotification(
            'Unable to save dark mode preference. Setting will reset on page reload.',
            'error'
        );
    }
}

/**
 * Load dark mode preference from localStorage
 */
function loadDarkModePreference() {
    try {
        const savedPreference = localStorage.getItem('darkMode');
        if (savedPreference !== null) {
            isDarkMode = savedPreference === 'true';
            applyDarkMode();
        }
    } catch (error) {
        console.error('Failed to load dark mode preference:', error);
        showNotification(
            'Unable to load dark mode preference. Using default light mode.',
            'error'
        );
        isDarkMode = false;
    }
}

// ======================
// Important Dates Feature
// ======================

let currentView = 'main'; // 'main' or 'dates'
let datesViewMode = 'calendar'; // 'calendar' or 'list'
let currentMonth = new Date();
let currentDateFilter = 'all';
let selectedTaskForDate = null;

/**
 * Initialize dates feature
 */
function initDatesFeature() {
    setupRouting();
    attachDatesEventListeners();
}

/**
 * Setup SPA routing
 */
function setupRouting() {
    function handleRoute() {
        const hash = window.location.hash || '#/';
        
        if (hash === '#/' || hash === '') {
            showMainView();
        } else if (hash.startsWith('#/dates')) {
            showDatesView();
        }
        
        updateNavigation();
    }
    
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

/**
 * Update navigation active states
 */
function updateNavigation() {
    const navTasks = document.getElementById('navTasks');
    const navDates = document.getElementById('navDates');
    const hash = window.location.hash || '#/';
    
    if (hash.startsWith('#/dates')) {
        navTasks.classList.remove('active');
        navDates.classList.add('active');
    } else {
        navTasks.classList.add('active');
        navDates.classList.remove('active');
    }
}

/**
 * Show main tasks view
 */
function showMainView() {
    currentView = 'main';
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('datesView').style.display = 'none';
    document.querySelector('.task-input').style.display = 'block';
    document.querySelector('.task-stats').style.display = 'block';
    document.querySelector('.task-filters').style.display = 'block';
}

/**
 * Show dates view
 */
function showDatesView() {
    currentView = 'dates';
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('datesView').style.display = 'block';
    document.querySelector('.task-input').style.display = 'none';
    document.querySelector('.task-stats').style.display = 'none';
    document.querySelector('.task-filters').style.display = 'none';
    
    renderDatesView();
    updateOverdueBadge();
}

/**
 * Attach event listeners for dates feature
 */
function attachDatesEventListeners() {
    // View tabs
    document.getElementById('calendarTab').addEventListener('click', () => switchDatesView('calendar'));
    document.getElementById('listTab').addEventListener('click', () => switchDatesView('list'));
    
    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);
    
    // Date filter
    document.getElementById('dateFilter').addEventListener('change', handleDateFilter);
    
    // Date picker modal
    document.getElementById('closeDatePicker').addEventListener('click', closeDatePickerModal);
    document.getElementById('setDate').addEventListener('click', setTaskDate);
    document.getElementById('clearDate').addEventListener('click', clearTaskDate);
    
    // Close modal on background click
    document.getElementById('datePickerModal').addEventListener('click', (e) => {
        if (e.target.id === 'datePickerModal') {
            closeDatePickerModal();
        }
    });
    
    // Quick Add modal
    document.getElementById('closeQuickAdd').addEventListener('click', closeQuickAddModal);
    document.getElementById('cancelQuickAdd').addEventListener('click', closeQuickAddModal);
    document.getElementById('submitQuickAdd').addEventListener('click', submitQuickAdd);
    
    // Close quick add on background click
    document.getElementById('quickAddModal').addEventListener('click', (e) => {
        if (e.target.id === 'quickAddModal') {
            closeQuickAddModal();
        }
    });
    
    // Quick add Enter key
    document.getElementById('quickAddInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitQuickAdd();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key to close modals
        if (e.key === 'Escape') {
            if (document.getElementById('datePickerModal').style.display === 'flex') {
                closeDatePickerModal();
            }
            if (document.getElementById('quickAddModal').style.display === 'flex') {
                closeQuickAddModal();
            }
        }
        
        // Shift+D for quick add
        if (e.shiftKey && e.key === 'D' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            openQuickAddModal();
        }
    });
}

/**
 * Switch between calendar and list views
 */
function switchDatesView(mode) {
    datesViewMode = mode;
    
    // Update tabs
    document.getElementById('calendarTab').classList.toggle('view-tab--active', mode === 'calendar');
    document.getElementById('listTab').classList.toggle('view-tab--active', mode === 'list');
    document.getElementById('calendarTab').setAttribute('aria-selected', mode === 'calendar');
    document.getElementById('listTab').setAttribute('aria-selected', mode === 'list');
    
    // Show/hide views
    document.getElementById('calendarView').style.display = mode === 'calendar' ? 'block' : 'none';
    document.getElementById('listViewContainer').style.display = mode === 'list' ? 'block' : 'none';
    
    renderDatesView();
}

/**
 * Render dates view based on current mode
 */
function renderDatesView() {
    if (datesViewMode === 'calendar') {
        renderCalendar();
    } else {
        renderListView();
    }
}

/**
 * Change calendar month
 */
function changeMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderCalendar();
}

/**
 * Go to today's date
 */
function goToToday() {
    currentMonth = new Date();
    renderCalendar();
    announceToScreenReader('Jumped to current month');
}

/**
 * Render calendar view
 */
function renderCalendar() {
    const monthTitle = document.getElementById('currentMonth');
    monthTitle.textContent = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    // Day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });
    
    // Get month info
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const today = new Date().toISOString().split('T')[0];
    
    // Previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const cell = createCalendarDay(day, true, year, month - 1);
        grid.appendChild(cell);
    }
    
    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = createCalendarDay(day, false, year, month, dateStr === today);
        grid.appendChild(cell);
    }
    
    // Next month's leading days
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
        const cell = createCalendarDay(day, true, year, month + 1);
        grid.appendChild(cell);
    }
    
    checkEmptyState();
}

/**
 * Create a calendar day cell
 */
function createCalendarDay(day, isOtherMonth, year, month, isToday = false) {
    const cell = document.createElement('div');
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    cell.className = 'calendar-day';
    if (isOtherMonth) {
        cell.classList.add('calendar-day--other-month');
    }
    if (isToday) {
        cell.classList.add('calendar-day--today');
    }
    
    const dateNumber = document.createElement('div');
    dateNumber.className = 'calendar-date-number';
    dateNumber.textContent = day;
    cell.appendChild(dateNumber);
    
    if (!isOtherMonth) {
        const tasksForDate = getTasksForDate(dateStr);
        const visibleTasks = tasksForDate.slice(0, 3);
        
        if (tasksForDate.length > 0) {
            cell.classList.add('calendar-day--has-tasks');
            const tasksContainer = document.createElement('div');
            tasksContainer.className = 'calendar-tasks';
            
            visibleTasks.forEach(task => {
                const taskEl = document.createElement('div');
                taskEl.className = 'calendar-task';
                
                if (task.completed) {
                    taskEl.classList.add('calendar-task--completed');
                } else if (isTaskOverdue(task)) {
                    taskEl.classList.add('calendar-task--overdue');
                } else if (isTaskDueToday(task)) {
                    taskEl.classList.add('calendar-task--today');
                } else {
                    taskEl.classList.add('calendar-task--future');
                }
                
                taskEl.textContent = task.text;
                taskEl.title = task.text;
                tasksContainer.appendChild(taskEl);
            });
            
            if (tasksForDate.length > 3) {
                const more = document.createElement('div');
                more.className = 'calendar-more-tasks';
                more.textContent = `+${tasksForDate.length - 3} more`;
                tasksContainer.appendChild(more);
            }
            
            cell.appendChild(tasksContainer);
        }
    }
    
    return cell;
}

/**
 * Render list view
 */
function renderListView() {
    const container = document.getElementById('listViewContent');
    container.innerHTML = '';
    
    const tasksWithDates = getFilteredDateTasks();
    
    if (tasksWithDates.length === 0) {
        checkEmptyState();
        return;
    }
    
    // Group tasks
    const groups = {
        overdue: [],
        today: [],
        tomorrow: [],
        thisWeek: [],
        later: []
    };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    tasksWithDates.forEach(task => {
        if (!task.completed && isTaskOverdue(task)) {
            groups.overdue.push(task);
        } else if (task.dueDate === todayStr) {
            groups.today.push(task);
        } else if (task.dueDate === tomorrowStr) {
            groups.tomorrow.push(task);
        } else if (new Date(task.dueDate) <= weekEnd) {
            groups.thisWeek.push(task);
        } else {
            groups.later.push(task);
        }
    });
    
    // Render each group
    if (groups.overdue.length > 0) {
        container.appendChild(createListSection('⚠️ Overdue', groups.overdue, true));
    }
    if (groups.today.length > 0) {
        container.appendChild(createListSection('📅 Today', groups.today));
    }
    if (groups.tomorrow.length > 0) {
        container.appendChild(createListSection('📅 Tomorrow', groups.tomorrow));
    }
    if (groups.thisWeek.length > 0) {
        container.appendChild(createListSection('📅 This Week', groups.thisWeek));
    }
    if (groups.later.length > 0) {
        container.appendChild(createListSection('📅 Later', groups.later));
    }
    
    checkEmptyState();
}

/**
 * Create a list section
 */
function createListSection(title, tasks, isOverdue = false) {
    const section = document.createElement('div');
    section.className = 'list-section';
    
    const header = document.createElement('div');
    header.className = `list-section-header ${isOverdue ? 'list-section-header--overdue' : ''}`;
    header.innerHTML = `
        ${title}
        <span class="list-section-count">(${tasks.length})</span>
    `;
    section.appendChild(header);
    
    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'list-task-item';
        if (isOverdue) {
            item.classList.add('list-task-item--overdue');
        } else if (isTaskDueToday(task)) {
            item.classList.add('list-task-item--today');
        }
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'list-task-checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => toggleTaskFromDatesView(task.id));
        
        const content = document.createElement('div');
        content.className = 'list-task-content';
        
        const text = document.createElement('div');
        text.className = `list-task-text ${task.completed ? 'list-task-text--completed' : ''}`;
        text.textContent = task.text;
        
        const date = document.createElement('div');
        date.className = `list-task-date ${isOverdue ? 'list-task-date--overdue' : ''}`;
        date.textContent = `Due: ${formatDate(task.dueDate)}`;
        
        content.appendChild(text);
        content.appendChild(date);
        
        item.appendChild(checkbox);
        item.appendChild(content);
        
        section.appendChild(item);
    });
    
    return section;
}

/**
 * Get tasks for a specific date
 */
function getTasksForDate(dateStr) {
    return tasks.filter(task => !task.deleted && task.dueDate === dateStr);
}

/**
 * Get all tasks with dates (filtered)
 */
function getFilteredDateTasks() {
    let filtered = tasks.filter(task => !task.deleted && task.dueDate);
    
    const today = new Date().toISOString().split('T')[0];
    
    switch (currentDateFilter) {
        case 'today':
            filtered = filtered.filter(task => task.dueDate === today);
            break;
        case 'week':
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + 7);
            const weekEndStr = weekEnd.toISOString().split('T')[0];
            filtered = filtered.filter(task => task.dueDate >= today && task.dueDate <= weekEndStr);
            break;
        case 'month':
            const monthEnd = new Date();
            monthEnd.setMonth(monthEnd.getMonth() + 1);
            const monthEndStr = monthEnd.toISOString().split('T')[0];
            filtered = filtered.filter(task => task.dueDate >= today && task.dueDate <= monthEndStr);
            break;
        case 'overdue':
            filtered = filtered.filter(task => !task.completed && task.dueDate < today);
            break;
    }
    
    return filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Check if task is overdue
 */
function isTaskOverdue(task) {
    if (!task.dueDate || task.completed) return false;
    const today = new Date().toISOString().split('T')[0];
    return task.dueDate < today;
}

/**
 * Check if task is due today
 */
function isTaskDueToday(task) {
    if (!task.dueDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return task.dueDate === today;
}

/**
 * Handle date filter change
 */
function handleDateFilter(e) {
    currentDateFilter = e.target.value;
    renderDatesView();
    announceToScreenReader(`Filter changed to ${currentDateFilter}`);
}

/**
 * Update overdue badge
 */
function updateOverdueBadge() {
    const overdueCount = tasks.filter(task => !task.deleted && isTaskOverdue(task)).length;
    const badge = document.getElementById('overdueBadge');
    const countEl = badge.querySelector('.overdue-badge__count');
    
    if (overdueCount > 0) {
        badge.style.display = 'flex';
        countEl.textContent = overdueCount;
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Check and show/hide empty state
 */
function checkEmptyState() {
    const tasksWithDates = getFilteredDateTasks();
    const emptyState = document.getElementById('datesEmptyState');
    const calendarView = document.getElementById('calendarView');
    const listView = document.getElementById('listViewContainer');
    
    if (tasksWithDates.length === 0) {
        emptyState.style.display = 'block';
        if (datesViewMode === 'calendar') {
            calendarView.style.display = 'none';
        } else {
            listView.style.display = 'none';
        }
    } else {
        emptyState.style.display = 'none';
        if (datesViewMode === 'calendar') {
            calendarView.style.display = 'block';
        } else {
            listView.style.display = 'block';
        }
    }
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Toggle task from dates view and sync with main view
 */
function toggleTaskFromDatesView(taskId) {
    const task = tasks.find(t => t.id === taskId && !t.deleted);
    if (task) {
        task.toggle();
        renderDatesView();
        updateOverdueBadge();
        saveTasks();
        announceToScreenReader(`Task marked as ${task.completed ? 'completed' : 'incomplete'}`);
    }
}

/**
 * Open date picker modal for a task
 */
function openDatePickerForTask(taskId) {
    selectedTaskForDate = taskId;
    const modal = document.getElementById('datePickerModal');
    const input = document.getElementById('dueDateInput');
    
    // Don't set min date - allow past dates to be set
    const today = new Date().toISOString().split('T')[0];
    
    // If task has a date, pre-fill it
    const task = tasks.find(t => t.id === taskId && !t.deleted);
    if (task && task.dueDate) {
        input.value = task.dueDate;
    } else {
        input.value = '';
    }
    
    modal.style.display = 'flex';
    input.focus();
}

/**
 * Close date picker modal
 */
function closeDatePickerModal() {
    document.getElementById('datePickerModal').style.display = 'none';
    selectedTaskForDate = null;
}

/**
 * Set task date
 */
function setTaskDate() {
    const input = document.getElementById('dueDateInput');
    const date = input.value;
    
    if (!date || !selectedTaskForDate) {
        return;
    }
    
    const task = tasks.find(t => t.id === selectedTaskForDate && !t.deleted);
    if (task) {
        task.setDueDate(date);
        closeDatePickerModal();
        saveTasks();
        
        // Update both views
        if (currentView === 'dates') {
            renderDatesView();
            updateOverdueBadge();
        } else {
            renderTasks();
        }
        
        announceToScreenReader(`Due date set to ${formatDate(date)}`);
    }
}

/**
 * Clear task date
 */
function clearTaskDate() {
    if (!selectedTaskForDate) {
        return;
    }
    
    const task = tasks.find(t => t.id === selectedTaskForDate && !t.deleted);
    if (task) {
        task.dueDate = null;
        closeDatePickerModal();
        saveTasks();
        
        // Update both views
        if (currentView === 'dates') {
            renderDatesView();
            updateOverdueBadge();
        } else {
            renderTasks();
        }
        
        announceToScreenReader('Due date cleared');
    }
}

/**
 * Open Quick Add modal (Shift+D)
 */
function openQuickAddModal() {
    const modal = document.getElementById('quickAddModal');
    const input = document.getElementById('quickAddInput');
    const dateInput = document.getElementById('quickAddDate');
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    // Clear previous input
    input.value = '';
    
    modal.style.display = 'flex';
    input.focus();
    
    announceToScreenReader('Quick add modal opened');
}

/**
 * Close Quick Add modal
 */
function closeQuickAddModal() {
    document.getElementById('quickAddModal').style.display = 'none';
}

/**
 * Submit Quick Add task
 */
function submitQuickAdd() {
    const input = document.getElementById('quickAddInput');
    const dateInput = document.getElementById('quickAddDate');
    
    const text = input.value.trim();
    const dueDate = dateInput.value;
    
    if (!text) {
        input.focus();
        return;
    }
    
    // Sanitize input
    const sanitizedText = sanitizeInput(text);
    
    // Create task with date
    const task = new Task(sanitizedText, null, dueDate || null);
    tasks.push(task);
    
    // Close modal
    closeQuickAddModal();
    
    // Update UI based on current view
    if (currentView === 'main') {
        addTaskToDOM(task);
        updateStats();
    } else {
        renderDatesView();
        updateOverdueBadge();
    }
    
    // Save to storage
    saveTasks();
    
    // Announce
    const dateText = dueDate ? ` with due date ${formatDate(dueDate)}` : '';
    announceToScreenReader(`Task "${sanitizedText}" added${dateText}`);
}

// ======================
// Start Application
// ======================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})(); // End of IIFE
