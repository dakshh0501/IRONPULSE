import QRCode from 'react-qr-code'

export default function MemberQR({
  member,
  size = 180
}) {

  if (!member?.id) {
    return null
  }

  return (

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12
      }}
    >

      <div
        style={{
          background: '#fff',
          padding: 16,
          borderRadius: 16
        }}
      >

        <QRCode
          value={member.id}
          size={size}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="H"
        />

      </div>

      <div
        style={{
          fontSize: 12,
          color: '#888',
          fontFamily: 'monospace'
        }}
      >
        {member.id}
      </div>

    </div>
  )
}