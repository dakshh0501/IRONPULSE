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
          background: 'var(--card-bg, #fff)',
          padding: 16,
          borderRadius: 16
        }}
      >

        <QRCode
          value={member.authUid || member.id}
          size={size}
          bgColor="#FFFFFF"
          fgColor="var(--qr-fg, #000000)"
          level="H"
        />

      </div>

    </div>
  )
}