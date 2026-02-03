import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabase';
import Icon3D from '../../components/Icon3D';

interface Props {
    onBack: () => void;
}

export default function WFHRequestForm({ onBack }: Props) {
    const [employeeId, setEmployeeId] = useState('');
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!employeeId || !date || !reason) {
            Alert.alert("Error", "Please fill all fields");
            return;
        }

        setLoading(true);
        try {
            // 1. Verify Employee
            const normalizedId = employeeId.trim().toUpperCase().replace(/\s+/g, '').replace(/^BS-/, '');
            const dbId = `BS-${normalizedId}`;

            const { data: user, error: userError } = await supabase
                .from('users')
                .select('id, name')
                .eq('employee_id', dbId)
                .single();

            if (userError || !user) {
                Alert.alert("Error", "Invalid Employee ID");
                setLoading(false);
                return;
            }

            // 2. Submit Request
            const { error: insertError } = await supabase
                .from('wfh_requests')
                .insert([{
                    user_id: user.id,
                    user_name: user.name,
                    date: date,
                    reason: reason,
                    status: 'Pending'
                }]);

            if (insertError) throw insertError;

            Alert.alert("Success", "WFH request submitted successfully", [
                { text: "OK", onPress: onBack }
            ]);

        } catch (e: any) {
            Alert.alert("Error", e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <ScrollView contentContainerStyle={{ padding: 24 }}>

                    <TouchableOpacity onPress={onBack} className="mb-6 flex-row items-center gap-2">
                        <Text className="text-blue-500 font-bold">← Back to Login</Text>
                    </TouchableOpacity>

                    <View className="mb-8">
                        <Icon3D icon="Plane" size="lg" variant="emerald" />
                        <Text className="text-3xl font-black text-slate-900 mt-4">Work From Home</Text>
                        <Text className="text-slate-500 mt-1">Request to work remotely.</Text>
                    </View>

                    <View className="space-y-4">
                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Employee ID</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700"
                                placeholder="BS-000"
                                value={employeeId}
                                onChangeText={setEmployeeId}
                                autoCapitalize="characters"
                            />
                        </View>

                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Date</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700"
                                placeholder="YYYY-MM-DD"
                                value={date}
                                onChangeText={setDate}
                            />
                        </View>

                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Reason</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700 h-24"
                                placeholder="Reason for WFH..."
                                value={reason}
                                onChangeText={setReason}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>

                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={loading}
                            className={`bg-emerald-600 p-4 rounded-xl items-center shadow-lg shadow-emerald-500/30 mt-4 ${loading ? 'opacity-50' : ''}`}
                        >
                            <Text className="text-white font-black uppercase tracking-widest text-lg">
                                {loading ? 'Submitting...' : 'Submit Request'}
                            </Text>
                        </TouchableOpacity>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
