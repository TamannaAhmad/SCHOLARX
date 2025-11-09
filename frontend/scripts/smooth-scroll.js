/**
 * Smooth Scroll Implementation
 * Ultra-smooth scrolling with momentum and easing
 */

class SmoothScroll {
    constructor() {
        this.scrollY = 0;
        this.targetY = 0;
        this.ease = 0.08; // Lower = smoother but slower
        this.isScrolling = false;
        this.rafId = null;
        
        this.init();
    }
    
    init() {
        // Set up scroll container
        document.documentElement.classList.add('smooth-scroll-enabled');
        
        // Listen to scroll events
        window.addEventListener('scroll', () => {
            this.targetY = window.pageYOffset;
        }, { passive: true });
        
        // Start animation loop
        this.animate();
        
        // Handle anchor links
        this.handleAnchorLinks();
    }
    
    animate() {
        // Calculate smooth scroll position
        this.scrollY += (this.targetY - this.scrollY) * this.ease;
        
        // Apply transform for smooth effect
        if (Math.abs(this.targetY - this.scrollY) > 0.5) {
            this.isScrolling = true;
            
            // Apply smooth scroll effect to body
            if (document.body.style.transform !== undefined) {
                document.body.style.transform = `translateY(${-this.scrollY}px)`;
            }
        } else {
            this.isScrolling = false;
            this.scrollY = this.targetY;
        }
        
        // Continue animation
        this.rafId = requestAnimationFrame(() => this.animate());
    }
    
    handleAnchorLinks() {
        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (href === '#' || href === '') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const targetPosition = target.offsetTop;
                    this.scrollTo(targetPosition);
                }
            });
        });
    }
    
    scrollTo(position, duration = 1000) {
        const start = this.targetY;
        const distance = position - start;
        const startTime = performance.now();
        
        const easeInOutCubic = (t) => {
            return t < 0.5 
                ? 4 * t * t * t 
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };
        
        const scroll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeInOutCubic(progress);
            
            window.scrollTo(0, start + distance * eased);
            
            if (progress < 1) {
                requestAnimationFrame(scroll);
            }
        };
        
        requestAnimationFrame(scroll);
    }
    
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        document.documentElement.classList.remove('smooth-scroll-enabled');
        document.body.style.transform = '';
    }
}

// Enhanced CSS-based smooth scroll (lighter alternative)
class CSSSmooth {
    constructor() {
        this.init();
    }
    
    init() {
        // Add smooth scroll CSS
        const style = document.createElement('style');
        style.textContent = `
            html {
                scroll-behavior: smooth;
            }
            
            * {
                scroll-behavior: smooth;
            }
            
            @media (prefers-reduced-motion: no-preference) {
                html {
                    scroll-behavior: smooth;
                }
                
                body {
                    overflow-x: hidden;
                    overflow-y: auto;
                }
                
                /* Smooth momentum scrolling for webkit */
                body {
                    -webkit-overflow-scrolling: touch;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Handle anchor links with smooth animation
        this.handleAnchorLinks();
        
        // Add momentum to scroll
        this.addMomentum();
    }
    
    handleAnchorLinks() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href === '#' || href === '') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                        inline: 'nearest'
                    });
                }
            });
        });
    }
    
    addMomentum() {
        let isScrolling = false;
        let scrollTimeout;
        
        window.addEventListener('scroll', () => {
            // Add scrolling class
            if (!isScrolling) {
                document.body.classList.add('is-scrolling');
                isScrolling = true;
            }
            
            // Remove scrolling class after scroll ends
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                document.body.classList.remove('is-scrolling');
                isScrolling = false;
            }, 150);
        }, { passive: true });
    }
}

// Initialize smooth scroll
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        // Check if Lenis is available (from CDN)
        if (typeof Lenis !== 'undefined') {
            // Initialize Lenis for ultra-smooth scrolling
            const lenis = new Lenis({
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                direction: 'vertical',
                gestureDirection: 'vertical',
                smooth: true,
                mouseMultiplier: 1,
                smoothTouch: false,
                touchMultiplier: 2,
                infinite: false,
            });
            
            // Animation frame loop
            function raf(time) {
                lenis.raf(time);
                requestAnimationFrame(raf);
            }
            requestAnimationFrame(raf);
            
            // Expose lenis globally for debugging
            window.lenis = lenis;
            
            console.log('✨ Lenis smooth scroll initialized');
        } else {
            // Fallback to CSS-based smooth scroll
            new CSSSmooth();
            console.log('✨ CSS smooth scroll initialized');
        }
    });
}

export { SmoothScroll, CSSSmooth };
