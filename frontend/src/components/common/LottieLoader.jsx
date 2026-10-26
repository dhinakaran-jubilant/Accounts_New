import React, { useEffect } from 'react';

const REMOTE_URL = 'https://lottie.host/12a145fc-c53e-4932-81d8-1d310a3cc8f0/IzI2s6UDyF.lottie';
const LOCAL_URL = '/loading.lottie';

/**
 * LottieLoader Component
 * Renders the requested DotLottie animation (https://lottie.host/12a145fc-c53e-4932-81d8-1d310a3cc8f0/IzI2s6UDyF.lottie)
 * using the standard dotlottie-player web component.
 *
 * @param {Object} props
 * @param {'xs'|'sm'|'md'|'lg'|'xl'|number} [props.size='md'] - Dimensions in pixels or preset size
 * @param {string} [props.text] - Optional loading message below the animation
 * @param {string} [props.className] - Optional container wrapper classes
 * @param {boolean} [props.fullPage=false] - If true, renders a centered full-screen/page overlay
 * @param {boolean} [props.inline=false] - If true, renders inline without extra padding
 */
export default function LottieLoader({
	size = 'md',
	text = 'Loading...',
	className = '',
	fullPage = false,
	inline = false,
}) {
	// Dynamically ensure script is present if not already loaded via index.html
	useEffect(() => {
		if (typeof window !== 'undefined' && !window.customElements?.get('dotlottie-player')) {
			const existing = document.querySelector('script[src*="dotlottie-player"]');
			if (!existing) {
				const script = document.createElement('script');
				script.src = '/dotlottie-player.js';
				script.async = true;
				document.head.appendChild(script);
			}
		}
	}, []);

	let pixelSize = 72;
	if (typeof size === 'number') {
		pixelSize = size;
	} else {
		switch (size) {
			case 'xs':
				pixelSize = 32;
				break;
			case 'sm':
				pixelSize = 48;
				break;
			case 'md':
				pixelSize = 72;
				break;
			case 'lg':
				pixelSize = 100;
				break;
			case 'xl':
				pixelSize = 140;
				break;
			default:
				pixelSize = 72;
		}
	}

	const loaderContent = (
		<div
			className={`flex flex-col items-center justify-center select-none ${
				inline ? '' : 'py-8 px-4'
			} ${className}`}
		>
			<div
				style={{
					width: `${pixelSize}px`,
					height: `${pixelSize}px`,
					minWidth: `${pixelSize}px`,
					minHeight: `${pixelSize}px`,
				}}
				className="flex items-center justify-center overflow-hidden"
			>
				<dotlottie-player
					src={REMOTE_URL}
					background="transparent"
					speed="1"
					style={{ width: `${pixelSize}px`, height: `${pixelSize}px` }}
					loop
					autoplay
				/>
			</div>
			{text && (
				<p className="text-xs font-bold text-slate-500 mt-2.5 tracking-tight text-center">
					{text}
				</p>
			)}
		</div>
	);

	if (fullPage) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-200">
				{loaderContent}
			</div>
		);
	}

	return loaderContent;
}

/**
 * TableLoader Component
 * Renders a full-width table row loader containing the Lottie animation
 */
export function TableLoader({ colSpan = 7, text = 'Loading data...', size = 'md', className = '' }) {
	return (
		<tr>
			<td colSpan={colSpan} className={`py-12 text-center ${className}`}>
				<LottieLoader text={text} size={size} />
			</td>
		</tr>
	);
}
