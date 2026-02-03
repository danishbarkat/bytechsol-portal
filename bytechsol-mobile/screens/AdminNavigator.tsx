import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/* Placeholder for Admin Dashboard */
export default function AdminNavigator() {
    return (
        <SafeAreaView className="flex-1 bg-white items-center justify-center">
            <Text className="text-2xl font-black text-slate-900">Admin Console</Text>
            <Text className="text-slate-500 mt-2">Mobile functionality coming soon.</Text>
        </SafeAreaView>
    );
}
