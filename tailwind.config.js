export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f8f9fa',
          100: '#e0e0e0',
          200: '#c0c0c0',
          300: '#a0a0a0',
          400: '#808080',
          500: '#606060',
          600: '#404856',
          700: '#2d3556',
          800: '#1a1f3a',
          900: '#0a0e27'
        },
        accent: {
          cyan: '#00d9ff',
          blue: '#0066ff',
          purple: '#9d4edd',
          pink: '#ff006e'
        }
      },
      backgroundImage: {
        'gradient-manus': 'linear-gradient(135deg, #00d9ff, #0066ff)',
        'gradient-manus-alt': 'linear-gradient(135deg, #0066ff, #9d4edd)',
        'gradient-dark': 'linear-gradient(135deg, #1a1f3a, #2d3556)'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-in'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 217, 255, 0.5)',
        'glow-blue': '0 0 20px rgba(0, 102, 255, 0.5)',
        'card': '0 4px 20px rgba(0, 0, 0, 0.3)'
      }
    }
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.text-gradient': {
          background: 'linear-gradient(to right, #00d9ff, #0066ff)',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
          color: 'transparent'
        },
        '.card-dark': {
          backgroundColor: '#1a1f3a',
          border: '1px solid #2d3556',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        },
        '.btn-primary': {
          padding: '0.5rem 1rem',
          borderRadius: '0.25rem',
          background: 'linear-gradient(to right, #00d9ff, #0066ff)',
          color: '#0a0e27',
          fontWeight: '600',
          transition: 'all 0.2s'
        }
      })
    }
  ]
}
