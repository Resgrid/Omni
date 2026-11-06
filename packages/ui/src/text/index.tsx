import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';

import { inlineFontLineHeight } from './line-height';
import { textStyle } from './styles';

type ITextProps = React.ComponentProps<typeof RNText> & VariantProps<typeof textStyle>;

const Text = React.forwardRef<React.ElementRef<typeof RNText>, ITextProps>(({ className, isTruncated, bold, underline, strikeThrough, size = 'md', sub, italic, highlight, style, ...props }, ref) => {
  // An inline fontSize keeps the size class's line height on native; scale it as CSS does on the web.
  const lineHeight = inlineFontLineHeight(style, size, sub === true, className);

  return (
    <RNText
      className={textStyle({
        isTruncated,
        bold,
        underline,
        strikeThrough,
        size,
        sub,
        italic,
        highlight,
        class: className,
      })}
      style={lineHeight === undefined ? style : StyleSheet.flatten([style, { lineHeight }])}
      {...props}
      ref={ref}
    />
  );
});

Text.displayName = 'Text';

export { Text };
