export default function Home() {
  return (
    <main style={{
      backgroundColor: 'black',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <h1 style={{
        color: 'white',
        fontSize: '64px',
        fontWeight: 'bold',
        margin: 0,
      }}>
        Layers
      </h1>
      <p style={{
        color: 'rgba(255,255,255,0.5)',
        fontSize: '18px',
        marginTop: '12px',
      }}>
        Daily #1 — coming soon
      </p>
    </main>
  )
}