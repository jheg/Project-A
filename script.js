/**
 * Task Manager Application
 * A simple, accessible task management application with localStorage persistence
 */

// ======================
// State Management
// ======================

let tasks = [];
let taskIdCounter = 0;
let currentFilter = 'all'; // 'all', 'active', or 'completed'
let isDarkMode = false;

// ======================
// DOM Elements
// ======================

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const totalTasksEl = document.getElementById('totalTasks');
const activeTasksEl = document.getElementById('activeTasks');
const completedTasksEl = document.getElementById('completedTasks');
const filterButtons = document.querySelectorAll('.filter-button');
const darkModeToggle = document.getElementById('darkModeToggle');

// ======================
// Task Class
// ======================

class Task {
    constructor(text, id = null) {
        this.id = id || ++taskIdCounter;
        this.text = text;
        this.completed = false;
        this.createdAt = new Date().toISOString();
    }

    toggle() {
        this.completed = !this.completed;
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
    
    const task = new Task(text);
    tasks.push(task);
    
    // Clear input and refocus
    taskInput.value = '';
    taskInput.focus();
    
    // Update UI and save
    renderTasks();
    updateStats();
    saveTasks();
    
    // Announce to screen readers
    announceToScreenReader(`Task "${text}" added`);
}

/**
 * Toggle task completion status
 */
function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    
    if (task) {
        task.toggle();
        renderTasks();
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
        tasks.splice(taskIndex, 1);
        
        renderTasks();
        updateStats();
        saveTasks();
        
        announceToScreenReader(`Task "${taskText}" deleted`);
    }
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
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-item__delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.setAttribute('aria-label', `Delete task "${task.text}"`);
    deleteBtn.addEventListener('click', () => {
        // Add animation before deleting
        li.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => deleteTask(task.id), 300);
    });
    
    // Assemble the task item
    li.appendChild(checkbox);
    li.appendChild(label);
    li.appendChild(deleteBtn);
    
    return li;
}

/**
 * Update task statistics
 */
function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    
    totalTasksEl.textContent = total;
    activeTasksEl.textContent = active;
    completedTasksEl.textContent = completed;
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
        localStorage.setItem('taskIdCounter', taskIdCounter.toString());
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
        const savedCounter = localStorage.getItem('taskIdCounter');
        
        if (savedTasks) {
            const parsedTasks = JSON.parse(savedTasks);
            // Recreate Task instances from plain objects
            tasks = parsedTasks.map(taskData => {
                const task = new Task(taskData.text, taskData.id);
                task.completed = taskData.completed;
                task.createdAt = taskData.createdAt;
                return task;
            });
        }
        
        if (savedCounter) {
            taskIdCounter = parseInt(savedCounter, 10);
        }
    } catch (error) {
        console.error('Failed to load tasks from localStorage:', error);
        showNotification(
            'Unable to load saved tasks. Starting with a fresh task list.',
            'error'
        );
        tasks = [];
        taskIdCounter = 0;
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
function showNotification(message, type = 'error', duration = 5000) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    
    const icon = document.createElement('span');
    icon.className = 'notification__icon';
    icon.textContent = '⚠️';
    icon.setAttribute('aria-hidden', 'true');
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification__message';
    messageSpan.textContent = message;
    
    notification.appendChild(icon);
    notification.appendChild(messageSpan);
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
// Start Application
// ======================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
