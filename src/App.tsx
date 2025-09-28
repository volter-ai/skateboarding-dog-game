import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [position, setPosition] = useState(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition((pos) => {
        if (pos > 80) setDirection(-1)
        if (pos < 0) setDirection(1)
        return pos + direction * 2
      })
    }, 50)
    return () => clearInterval(interval)
  }, [direction])

  return (
    <div className="skateboarding-container">
      <div 
        className="dog-container"
        style={{ left: `${position}%` }}
      >
        <div className="dog">🐕</div>
        <div className="skateboard">🛹</div>
      </div>
    </div>
  )
}

export default App