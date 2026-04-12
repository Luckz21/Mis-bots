// ============================================
// LockBox Bot - Landing Page Scripts
// ============================================

// Canvas de partículas
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let particles = [];

function initCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    
    particles = [];
    const particleCount = Math.floor((width * height) / 15000);
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 0.5,
            speedX: (Math.random() - 0.5) * 0.3,
            speedY: (Math.random() - 0.5) * 0.3,
            color: `rgba(25, 0, 255, ${Math.random() * 0.3 + 0.1})`
        });
    }
}

function drawParticles() {
    ctx.clearRect(0, 0, width, height);
    
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
    });
    
    requestAnimationFrame(drawParticles);
}

window.addEventListener('resize', () => {
    initCanvas();
});

// Animación de números
function animateNumbers() {
    const numberElements = document.querySelectorAll('[data-count]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-count'));
                let current = 0;
                const duration = 2000;
                const step = target / (duration / 16);
                
                const updateNumber = () => {
                    current += step;
                    if (current < target) {
                        el.textContent = Math.floor(current).toLocaleString();
                        requestAnimationFrame(updateNumber);
                    } else {
                        el.textContent = target.toLocaleString();
                    }
                };
                requestAnimationFrame(updateNumber);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    
    numberElements.forEach(el => observer.observe(el));
}

// Animación de tarjetas al scroll
function initScrollAnimations() {
    const cards = document.querySelectorAll('.feature-card');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    cards.forEach(card => observer.observe(card));
}

// Header scroll effect
function initHeaderScroll() {
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// Smooth scroll para enlaces internos
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// Menú móvil
function initMobileMenu() {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav-links');
    
    if (btn) {
        btn.addEventListener('click', () => {
            nav.classList.toggle('active');
            const icon = btn.querySelector('i');
            if (nav.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }
}

// Añadir estilos para menú móvil
const style = document.createElement('style');
style.textContent = `
    @media (max-width: 768px) {
        .nav-links.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(10, 10, 12, 0.95);
            backdrop-filter: blur(16px);
            padding: 2rem;
            border-bottom: 1px solid var(--border-color);
            gap: 1.5rem;
        }
    }
`;
document.head.appendChild(style);

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    drawParticles();
    animateNumbers();
    initScrollAnimations();
    initHeaderScroll();
    initSmoothScroll();
    initMobileMenu();
});

// Re-inicializar canvas en resize
window.addEventListener('resize', () => {
    initCanvas();
});

// Efecto parallax suave
window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual) {
        heroVisual.style.transform = `translateY(${scrolled * 0.1}px)`;
    }
});
