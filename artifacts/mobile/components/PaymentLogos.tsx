/**
 * PaymentLogos.tsx — Logos officiels des moyens de paiement mobile money
 * (Chantier 1 : remplace les icônes génériques Feather au checkout, étape
 * Paiement, par les marques réelles de Wave / Orange Money / MTN MoMo).
 *
 * Sources :
 * - Wave   : favicon officiel wave.com/img/favicon.png (pictogramme pingouin
 *            seul, déjà carré) → assets/images/payment-logos/wave-logo.png
 * - Orange Money : tracés vectoriels réels du fichier "Logo Orange Money.svg"
 *   (Wikimedia Commons, licence logo simple — pas de seuil d'originalité).
 *   Seul le pictogramme (2 premiers tracés) est gardé, le bloc texte
 *   "Orange Money" du fichier d'origine est retiré : le libellé est déjà
 *   affiché à côté par l'écran de checkout.
 * - MTN MoMo : aucun fichier vectoriel officiel « ellipse jaune + MoMo »
 *   trouvable en source fiable/réutilisable (le seul asset MTN hébergé
 *   officiellement est un ancien pictogramme bleu/or qui ne correspond plus
 *   à l'identité actuelle) → recréation fidèle aux couleurs de marque MTN
 *   (jaune Pantone #FFCC00, wordmark noir "MoMo").
 */
import React from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import Svg, { Ellipse, SvgXml, Text as SvgText } from 'react-native-svg';

const WAVE_LOGO_SRC = require('../assets/images/payment-logos/wave-logo.png');

// Pictogramme Orange Money seul (tracés officiels, wordmark texte retiré, viewBox recadrée).
const ORANGE_MONEY_MARK_SVG = `
<svg viewBox="0 0 210 115" xmlns="http://www.w3.org/2000/svg">
  <path d="M90.154 11.052H24.335c-3.542 0-6.94 1.413-9.445 3.929a13.44 13.44 0 0 0-3.913 9.484c0 3.558 1.408 6.969 3.913 9.485a13.332 13.332 0 0 0 9.445 3.929h33.596L3.886 92.097a13.442 13.442 0 0 0-3.914 9.486c0 3.558 1.408 6.97 3.914 9.486a13.33 13.33 0 0 0 9.447 3.929c3.543 0 6.941-1.413 9.447-3.929l53.994-54.225v33.683c0 3.558 1.408 6.97 3.913 9.485a13.328 13.328 0 0 0 9.445 3.929c3.543 0 6.941-1.413 9.446-3.929a13.44 13.44 0 0 0 3.912-9.485V24.465c0-3.553-1.404-6.962-3.904-9.477a13.337 13.337 0 0 0-9.432-3.936Z" fill="#000000" transform="translate(.028 -.086)"/>
  <path d="M130.236 103.948h65.79c3.542 0 6.94-1.413 9.445-3.929a13.44 13.44 0 0 0 3.913-9.484c0-3.558-1.408-6.969-3.913-9.485a13.328 13.328 0 0 0-9.445-3.929h-33.545l53.994-54.218a13.438 13.438 0 0 0 3.833-9.459 13.441 13.441 0 0 0-3.91-9.428 13.331 13.331 0 0 0-9.387-3.93 13.327 13.327 0 0 0-9.422 3.845l-53.995 54.225V24.465c0-3.557-1.407-6.969-3.913-9.484a13.326 13.326 0 0 0-9.445-3.929 13.329 13.329 0 0 0-9.446 3.929 13.44 13.44 0 0 0-3.912 9.484v66.062a13.48 13.48 0 0 0 1.014 5.136 13.412 13.412 0 0 0 2.896 4.354 13.343 13.343 0 0 0 9.448 3.931Z" fill="#FF7900" transform="translate(.028 -.086)"/>
</svg>
`;

interface LogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/** Pictogramme Wave (pingouin) sur son disque bleu de marque. */
export function WaveLogo({ size = 44, style }: LogoProps) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#1AC9FF' },
        style,
      ]}
    >
      <Image source={WAVE_LOGO_SRC} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

/** Pictogramme Orange Money sur disque blanc (couleurs de marque officielles). */
export function OrangeMoneyLogo({ size = 44, style }: LogoProps) {
  return (
    <View
      style={[
        {
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
        },
        style,
      ]}
    >
      <SvgXml xml={ORANGE_MONEY_MARK_SVG} width={size * 0.64} height={size * 0.64} />
    </View>
  );
}

/** Badge MTN MoMo — ellipse jaune de marque (#FFCC00) + wordmark "MoMo". */
export function MtnMomoLogo({ size = 44, style }: LogoProps) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFCC00', alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Svg width={size * 0.88} height={size * 0.5} viewBox="0 0 62 30">
        <Ellipse cx={31} cy={15} rx={31} ry={15} fill="#FFCC00" />
        <SvgText
          x={31}
          y={21.5}
          fontSize={17}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
        >
          MoMo
        </SvgText>
      </Svg>
    </View>
  );
}

export const MOBILE_MONEY_LOGOS: Record<string, React.ComponentType<LogoProps>> = {
  wave: WaveLogo,
  orange_money: OrangeMoneyLogo,
  mtn_momo: MtnMomoLogo,
};
